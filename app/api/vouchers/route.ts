import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isAdminOrOfficial, getDbRole } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const dbRole = await getDbRole(session.userId);

    let query = supabase
      .from("expense_vouchers")
      .select("*, submitter:submitted_by(id, name, email, phone, official_type), approver:approved_by(id, name)")
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    // Officials see only their own; admins see all
    if (dbRole !== "admin") {
      query = query.eq("submitted_by", session.userId);
    }

    const { data: vouchers, error } = await query;

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/vouchers", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch vouchers" }, { status: 500 });
    }

    return NextResponse.json({ vouchers: vouchers || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/vouchers", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch vouchers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only officials and admins can create expense vouchers
    if (!(await isAdminOrOfficial(session))) {
      return NextResponse.json({ error: "Only officials can submit expense vouchers" }, { status: 403 });
    }

    const body = await req.json();
    if (!body.title || body.amount === undefined) {
      return NextResponse.json({ error: "Title and amount are required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("expense_vouchers")
      .insert({
        submitted_by: session.userId,
        title: body.title,
        amount: parseFloat(body.amount) || 0,
        description: body.description || "",
        receipt_url: body.receipt_url || null,
      })
      .select("*, submitter:submitted_by(id, name, email, official_type)")
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/vouchers", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create voucher" }, { status: 500 });
    }

    return NextResponse.json({ voucher: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/vouchers", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create voucher" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "Voucher ID is required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const admin = await isAdmin(session);

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (admin) {
      if (body.status !== undefined) {
        updates.status = body.status;
        if (body.status === "approved" || body.status === "rejected") {
          updates.approved_by = session.userId;
          updates.approved_at = new Date().toISOString();
        }
      }
      if (body.remarks !== undefined) updates.remarks = body.remarks;
    } else {
      // Officials can only update their own pending vouchers
      if (body.title !== undefined) updates.title = body.title;
      if (body.amount !== undefined) updates.amount = body.amount;
      if (body.description !== undefined) updates.description = body.description;
      if (body.receipt_url !== undefined) updates.receipt_url = body.receipt_url;
    }

    let query = supabase.from("expense_vouchers").update(updates).eq("id", body.id);
    if (!admin) {
      query = query.eq("submitted_by", session.userId).eq("status", "pending");
    }

    const { error } = await query;

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/vouchers", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update voucher" }, { status: 500 });
    }

    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/vouchers", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update voucher" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const admin = await isAdmin(session);

    let query = supabase.from("expense_vouchers").delete().eq("id", id);
    if (!admin) {
      query = query.eq("submitted_by", session.userId).eq("status", "pending");
    }

    await query;
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/vouchers", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete voucher" }, { status: 500 });
  }
}
