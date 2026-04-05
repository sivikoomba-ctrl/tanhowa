import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isAdminOrOfficial, getDbRole, isSuperAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { logAudit } from "@/lib/audit-log";
import { sendVoucherStatusEmail } from "@/lib/mail";

const FINANCE_TEAM_ID = "1c09bb67-5df7-4d1a-9b08-e0860a350061";

async function isFinanceTeamMember(userId: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("team_id", FINANCE_TEAM_ID)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const superAdmin = await isSuperAdmin(session);
    const financeAccess = superAdmin || await isFinanceTeamMember(session.userId);

    let query = supabase
      .from("expense_vouchers")
      .select("*, submitter:submitted_by(id, name, email, phone, official_type), approver:approved_by(id, name)")
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    // Finance team + super_admin see all vouchers; others see only their own
    if (!financeAccess) {
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
        submitted_by: body.submitted_by || session.userId,
        title: body.title,
        amount: parseFloat(body.amount) || 0,
        description: body.description || "",
        invoice_number: body.invoice_number || "",
        vendor_name: body.vendor_name || "",
        expense_date: body.expense_date || null,
        category: body.category || "",
        receipt_url: body.receipt_url || null,
      })
      .select("*, submitter:submitted_by(id, name, email, official_type)")
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/vouchers", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create voucher" }, { status: 500 });
    }

    logContribution(session.userId, "expense_voucher_submitted", "Submitted expense voucher: " + body.title);

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

    // Support bulk operations: ids[] array OR single id
    const ids: string[] = body.ids || (body.id ? [body.id] : []);
    if (ids.length === 0) {
      return NextResponse.json({ error: "Voucher ID is required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const superAdmin = await isSuperAdmin(session);
    const financeAccess = superAdmin || await isFinanceTeamMember(session.userId);

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (financeAccess) {
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
      if (body.invoice_number !== undefined) updates.invoice_number = body.invoice_number;
      if (body.vendor_name !== undefined) updates.vendor_name = body.vendor_name;
      if (body.expense_date !== undefined) updates.expense_date = body.expense_date;
      if (body.category !== undefined) updates.category = body.category;
      if (body.receipt_url !== undefined) updates.receipt_url = body.receipt_url;
    }

    let query = supabase.from("expense_vouchers").update(updates).in("id", ids);
    if (!financeAccess) {
      query = query.eq("submitted_by", session.userId).eq("status", "pending");
    }

    const { error } = await query;

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/vouchers", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update voucher" }, { status: 500 });
    }

    // Send email notifications for status changes (fire-and-forget)
    if (financeAccess && body.status && (body.status === "approved" || body.status === "rejected")) {
      (async () => {
        try {
          const { data: updatedVouchers } = await supabase
            .from("expense_vouchers")
            .select("title, amount, remarks, submitter:submitted_by(name, email)")
            .in("id", ids);
          for (const v of updatedVouchers || []) {
            const sub = v.submitter as unknown as { name: string; email: string } | null;
            if (sub?.email) {
              sendVoucherStatusEmail(sub.email, sub.name, v.title, v.amount, body.status, v.remarks || body.remarks || "").catch(() => {});
            }
          }
        } catch (e) { logError({ type: "api", message: `Voucher email failed: ${e instanceof Error ? e.message : String(e)}`, path: "/api/vouchers", method: "PUT", status_code: 500 }); }
      })();
    }

    if (financeAccess && body.status) {
      for (const vid of ids) {
        logAudit(session.userId, "voucher_" + body.status, "voucher", vid);
      }
    }

    return NextResponse.json({ message: "Updated", count: ids.length });
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
    const superAdmin = await isSuperAdmin(session);
    const financeAccess = superAdmin || await isFinanceTeamMember(session.userId);

    let query = supabase.from("expense_vouchers").delete().eq("id", id);
    if (!financeAccess) {
      query = query.eq("submitted_by", session.userId).eq("status", "pending");
    }

    await query;
    logAudit(session.userId, "voucher_deleted", "voucher", id);
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/vouchers", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete voucher" }, { status: 500 });
  }
}
