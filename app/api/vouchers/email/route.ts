import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isSuperAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { sendVoucherReceiptEmail } from "@/lib/mail";

const FINANCE_TEAM_ID = "1c09bb67-5df7-4d1a-9b08-e0860a350061";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const superAdmin = await isSuperAdmin(session);
    if (!superAdmin) {
      const supabaseCheck = getServiceClient();
      const { data: membership } = await supabaseCheck
        .from("team_members")
        .select("user_id")
        .eq("team_id", FINANCE_TEAM_ID)
        .eq("user_id", session.userId)
        .maybeSingle();
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Voucher ID is required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data: voucher, error } = await supabase
      .from("expense_vouchers")
      .select("*, submitter:submitted_by(id, name, email, phone, official_type), approver:approved_by(name)")
      .eq("id", id)
      .single();

    if (error || !voucher) {
      return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
    }

    const submitter = voucher.submitter as unknown as { id: string; name: string; email: string; phone: string; official_type: string | null } | null;
    if (!submitter?.email) {
      return NextResponse.json({ error: "No email address found for this official" }, { status: 400 });
    }

    const approver = voucher.approver as unknown as { name: string } | null;

    await sendVoucherReceiptEmail(submitter.email, submitter.name, {
      id: voucher.id,
      title: voucher.title,
      amount: voucher.amount,
      description: voucher.description || "",
      invoice_number: voucher.invoice_number || "",
      vendor_name: voucher.vendor_name || "",
      expense_date: voucher.expense_date,
      category: voucher.category || "",
      status: voucher.status,
      remarks: voucher.remarks || "",
      created_at: voucher.created_at,
      submitter_name: submitter.name,
      submitter_email: submitter.email,
      submitter_phone: submitter.phone || "",
      submitter_official_type: submitter.official_type || "",
      approver_name: approver?.name || "",
      approved_at: voucher.approved_at,
    });

    return NextResponse.json({ message: "Email sent successfully" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/vouchers/email", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
