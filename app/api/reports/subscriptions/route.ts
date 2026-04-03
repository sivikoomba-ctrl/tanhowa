import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const district = url.searchParams.get("district") || "all";
    const period = url.searchParams.get("period") || "all";
    const status = url.searchParams.get("status") || "all"; // paid, pending, overdue, all

    const supabase = getServiceClient();

    // Fetch all approved members
    const { data: allMembers } = await supabase
      .from("users")
      .select("id, name, email, phone, posting_details, occupation")
      .eq("status", "approved")
      .neq("email", "tanhowaadmin@tanhowa.in");

    // Filter by district if specified
    let members = allMembers || [];
    if (district !== "all") {
      members = members.filter(
        (m) =>
          (m.posting_details as { regular_district?: string })?.regular_district === district
      );
    }
    const memberIds = members.map((m) => m.id);
    const memberMap = new Map(members.map((m) => [m.id, m]));

    if (memberIds.length === 0) {
      return NextResponse.json({ members: [], periods: [], summary: { total: 0, paid: 0, pending: 0, overdue: 0, totalAmount: 0 } });
    }

    // Fetch subscriptions for these members
    let query = supabase
      .from("subscriptions")
      .select("id, user_id, period, amount, status, paid_at, payment_method, transaction_id")
      .in("user_id", memberIds);

    if (period !== "all") {
      query = query.eq("period", period);
    }
    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data: subscriptions } = await query;

    // Get all distinct periods
    const { data: allPeriods } = await supabase
      .from("subscriptions")
      .select("period")
      .order("period", { ascending: false });
    const periods = [...new Set((allPeriods || []).map((p: { period: string }) => p.period))];

    // Build member-level report
    const report = (subscriptions || []).map((s) => {
      const member = memberMap.get(s.user_id);
      const pd = member?.posting_details as { regular_district?: string; regular_block?: string } | null;
      return {
        id: s.id,
        user_id: s.user_id,
        name: member?.name || "Unknown",
        email: member?.email || "",
        phone: member?.phone || "",
        occupation: member?.occupation || "",
        district: pd?.regular_district || "Unassigned",
        block: pd?.regular_block || "",
        period: s.period,
        amount: s.amount,
        status: s.status,
        paid_at: s.paid_at,
        payment_method: s.payment_method,
        transaction_id: s.transaction_id,
      };
    });

    // Summary
    const paid = report.filter((r) => r.status === "paid");
    const pending = report.filter((r) => r.status === "pending");
    const overdue = report.filter((r) => r.status === "overdue");
    const summary = {
      total: report.length,
      paid: paid.length,
      pending: pending.length,
      overdue: overdue.length,
      totalAmount: paid.reduce((sum, r) => sum + (r.amount || 0), 0),
    };

    return NextResponse.json({ members: report, periods, summary });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/reports/subscriptions", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
