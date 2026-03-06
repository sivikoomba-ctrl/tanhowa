import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getDbRole } from "@/lib/auth";
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

    const dbRole = await getDbRole(session.userId);
    if (dbRole === "admin") {
      let query = supabase
        .from("subscriptions")
        .select("*, users(name, email, phone)")
        .order("created_at", { ascending: false });

      if (period) query = query.eq("period", period);
      if (status && status !== "all") query = query.eq("status", status);

      const { data: subscriptions } = await query;

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
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
    }

    const supabase = getServiceClient();
    const body = await req.json();

    if (body.action === "bulk-create") {
      // Get all approved members (exclude admins)
      const { data: users } = await supabase
        .from("users")
        .select("id")
        .eq("status", "approved")
        .neq("role", "admin");

      if (!users || users.length === 0) {
        return NextResponse.json({ error: "No approved members found" }, { status: 400 });
      }

      // Get existing subscriptions for this period
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("period", body.period);

      const existingIds = new Set((existing || []).map((s: { user_id: string }) => s.user_id));
      const newUsers = users.filter((u: { id: string }) => !existingIds.has(u.id));

      if (newUsers.length === 0) {
        return NextResponse.json({ error: "All members already have subscriptions for this period" }, { status: 400 });
      }

      const rows = newUsers.map((u: { id: string }) => ({
        user_id: u.id,
        period: body.period,
        amount: parseFloat(body.amount) || 0,
        due_date: body.due_date || null,
        status: "pending",
      }));

      const { error } = await supabase.from("subscriptions").insert(rows);

      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/subscriptions", method: "POST", status_code: 500 });
        return NextResponse.json({ error: "Failed to create subscriptions" }, { status: 500 });
      }

      return NextResponse.json({ message: `Created ${newUsers.length} subscriptions`, count: newUsers.length });
    } else {
      const { data, error } = await supabase
        .from("subscriptions")
        .insert({
          user_id: body.user_id,
          period: body.period,
          amount: body.amount || 0,
          due_date: body.due_date || null,
          status: "pending",
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

    const putRole = await getDbRole(session.userId);
    if (putRole !== "admin") {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("id", body.id)
        .single();

      if (!sub || sub.user_id !== session.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

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

    const updates: Record<string, string | number | null> = { updated_at: new Date().toISOString() };
    if (body.status) {
      updates.status = body.status;
      if (body.status === "paid") {
        updates.paid_at = body.paid_at || new Date().toISOString();
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
    if (!session || !(await isAdmin(session))) {
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
