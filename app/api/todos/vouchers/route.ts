import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getDbRole } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { notifyVoucherAction } from "@/lib/telegram";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const todoId = url.searchParams.get("todo_id");
    const status = url.searchParams.get("status");
    const dbRole = await getDbRole(session.userId);

    let query = supabase
      .from("todo_vouchers")
      .select("*, submitter:submitted_by(id, name, photo_url), approver:approved_by(id, name), todo:todo_id(id, title, event_id)")
      .order("created_at", { ascending: false });

    if (todoId) {
      query = query.eq("todo_id", todoId);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    // Members see only their own vouchers; admins/finance see all
    if (dbRole !== "admin") {
      query = query.eq("submitted_by", session.userId);
    }

    const { data: vouchers, error } = await query;

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos/vouchers", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch vouchers" }, { status: 500 });
    }

    return NextResponse.json({ vouchers: vouchers || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/vouchers", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch vouchers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (!body.todo_id || !body.title || body.amount === undefined) {
      return NextResponse.json({ error: "todo_id, title, and amount are required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("todo_vouchers")
      .insert({
        todo_id: body.todo_id,
        submitted_by: session.userId,
        title: body.title,
        amount: body.amount,
        description: body.description || "",
        receipt_url: body.receipt_url || null,
      })
      .select("*, submitter:submitted_by(id, name, photo_url)")
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos/vouchers", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create voucher" }, { status: 500 });
    }

    logContribution(session.userId, "voucher_submitted", "Submitted task voucher");

    return NextResponse.json({ voucher: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/vouchers", method: "POST", status_code: 500 });
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
    const dbRole = await getDbRole(session.userId);

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (dbRole === "admin") {
      // Admin/Finance can approve/reject and add remarks
      if (body.status !== undefined) {
        updates.status = body.status;
        if (body.status === "approved" || body.status === "rejected") {
          updates.approved_by = session.userId;
          updates.approved_at = new Date().toISOString();
        }
      }
      if (body.remarks !== undefined) updates.remarks = body.remarks;
    } else {
      // Members can only update their own pending vouchers
      if (body.title !== undefined) updates.title = body.title;
      if (body.amount !== undefined) updates.amount = body.amount;
      if (body.description !== undefined) updates.description = body.description;
      if (body.receipt_url !== undefined) updates.receipt_url = body.receipt_url;
    }

    let query = supabase.from("todo_vouchers").update(updates).eq("id", body.id);

    if (dbRole !== "admin") {
      query = query.eq("submitted_by", session.userId).eq("status", "pending");
    }

    const { error } = await query;

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos/vouchers", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update voucher" }, { status: 500 });
    }

    // Log contribution for voucher status changes
    if (dbRole === "admin" && body.status === "approved") {
      logContribution(session.userId, "voucher_approved", "Approved voucher");
    } else if (dbRole === "admin" && body.status === "rejected") {
      logContribution(session.userId, "voucher_rejected", "Rejected voucher");
    }

    // Fire-and-forget: notify voucher submitter on approval/rejection
    if (dbRole === "admin" && (body.status === "approved" || body.status === "rejected")) {
      (async () => {
        try {
          const { data: voucher } = await supabase
            .from("todo_vouchers")
            .select("title, submitted_by, todo:todo_id(event_id)")
            .eq("id", body.id)
            .single();
          if (!voucher || !voucher.submitted_by) return;

          const { data: submitter } = await supabase
            .from("users")
            .select("telegram_chat_id")
            .eq("id", voucher.submitted_by)
            .single();

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const eventId = (voucher.todo as any)?.event_id || "";
          if (submitter?.telegram_chat_id) {
            notifyVoucherAction(submitter.telegram_chat_id, voucher.title, eventId, body.status, body.remarks || "").catch(() => {});
          }
        } catch { /* silent */ }
      })();
    }

    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/vouchers", method: "PUT", status_code: 500 });
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
    const dbRole = await getDbRole(session.userId);

    // Members can only delete their own pending vouchers
    let query = supabase.from("todo_vouchers").delete().eq("id", id);
    if (dbRole !== "admin") {
      query = query.eq("submitted_by", session.userId).eq("status", "pending");
    }

    await query;
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/vouchers", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete voucher" }, { status: 500 });
  }
}
