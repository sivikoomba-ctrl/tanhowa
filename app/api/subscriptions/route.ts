import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const period = url.searchParams.get("period");
    const status = url.searchParams.get("status");

    if (session.role === "admin") {
      // Admin: get all subscriptions with user info
      let query = supabase
        .from("subscriptions")
        .select("*, users(name, email, phone)")
        .order("created_at", { ascending: false });

      if (period) query = query.eq("period", period);
      if (status && status !== "all") query = query.eq("status", status);

      const { data: subscriptions } = await query;

      // Also get summary stats
      const [paidRes, pendingRes, overdueRes, totalAmountRes] = await Promise.all([
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "paid"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "overdue"),
        supabase.from("subscriptions").select("amount").eq("status", "paid"),
      ]);

      const totalCollected = (totalAmountRes.data || []).reduce((sum: number, r: { amount: number }) => sum + (r.amount || 0), 0);

      return NextResponse.json({
        subscriptions: subscriptions || [],
        stats: {
          paid: paidRes.count || 0,
          pending: pendingRes.count || 0,
          overdue: overdueRes.count || 0,
          totalCollected,
        },
      });
    } else {
      // Member: get own subscriptions
      const { data: subscriptions } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", session.userId)
        .order("created_at", { ascending: false });

      return NextResponse.json({ subscriptions: subscriptions || [] });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const supabase = getServiceClient();

    if (body.action === "bulk-create") {
      // Create subscriptions for all approved members for a given period
      const { data: approvedUsers } = await supabase
        .from("users")
        .select("id")
        .eq("status", "approved");

      if (!approvedUsers || approvedUsers.length === 0) {
        return NextResponse.json({ error: "No approved members found" }, { status: 400 });
      }

      // Check which users already have a subscription for this period
      const { data: existing, error: existErr } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("period", body.period);

      if (existErr) {
        await logError({ type: "api", message: existErr.message, path: "/api/subscriptions", method: "POST", status_code: 500 });
        return NextResponse.json({ error: `Database error: ${existErr.message}. Make sure the subscriptions table exists.` }, { status: 500 });
      }

      const existingIds = new Set((existing || []).map((e: { user_id: string }) => e.user_id));
      const newSubs = approvedUsers
        .filter((u: { id: string }) => !existingIds.has(u.id))
        .map((u: { id: string }) => ({
          user_id: u.id,
          period: body.period,
          amount: body.amount || 0,
          due_date: body.due_date || null,
          status: "pending",
          created_by: session.userId,
        }));

      if (newSubs.length === 0) {
        return NextResponse.json({ error: "All members already have subscriptions for this period" }, { status: 400 });
      }

      const { error } = await supabase.from("subscriptions").insert(newSubs);

      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/subscriptions", method: "POST", status_code: 500 });
        return NextResponse.json({ error: `Failed to create subscriptions: ${error.message}` }, { status: 500 });
      }

      return NextResponse.json({ message: `Created ${newSubs.length} subscriptions`, count: newSubs.length });
    } else {
      // Create single subscription
      const { data, error } = await supabase
        .from("subscriptions")
        .insert({
          user_id: body.user_id,
          period: body.period,
          amount: body.amount || 0,
          due_date: body.due_date || null,
          status: "pending",
          created_by: session.userId,
        })
        .select()
        .single();

      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/subscriptions", method: "POST", status_code: 500 });
        return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
      }

      return NextResponse.json({ subscription: data });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const supabase = getServiceClient();

    // Members can only update their own subscription's payment details
    if (session.role !== "admin") {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("id", body.id)
        .single();

      if (!sub || sub.user_id !== session.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Members can only update payment info, not status/amount
      const memberUpdates: Record<string, string | null> = { updated_at: new Date().toISOString() };
      if (body.payment_method !== undefined) memberUpdates.payment_method = body.payment_method;
      if (body.transaction_id !== undefined) memberUpdates.transaction_id = body.transaction_id;
      if (body.remarks !== undefined) memberUpdates.remarks = body.remarks;
      if (body.payment_proof_url !== undefined) memberUpdates.payment_proof_url = body.payment_proof_url;

      const { error } = await supabase
        .from("subscriptions")
        .update(memberUpdates)
        .eq("id", body.id);

      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/subscriptions", method: "PUT", status_code: 500 });
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
      }

      return NextResponse.json({ message: "Updated" });
    }

    // Admin can update everything
    const updates: Record<string, string | number | null> = { updated_at: new Date().toISOString() };
    if (body.status) {
      updates.status = body.status;
      if (body.status === "paid") {
        updates.paid_at = new Date().toISOString();
      }
    }
    if (body.amount !== undefined) updates.amount = body.amount;
    if (body.payment_method !== undefined) updates.payment_method = body.payment_method;
    if (body.transaction_id !== undefined) updates.transaction_id = body.transaction_id;
    if (body.remarks !== undefined) updates.remarks = body.remarks;
    if (body.payment_proof_url !== undefined) updates.payment_proof_url = body.payment_proof_url;

    const { error } = await supabase
      .from("subscriptions")
      .update(updates)
      .eq("id", body.id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/subscriptions", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    await supabase.from("subscriptions").delete().eq("id", id);

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
