import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getOfficialType } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

/**
 * GET /api/finance?year=2025-26
 *
 * Full ledger: admins, state officials, district officials (DS/DJS)
 * Abstract summary only: regular members
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await isAdmin(session);
    const officialType = await getOfficialType(session.userId);
    const hasFullAccess = admin || officialType === "state" || officialType === "district";

    const url = new URL(req.url);
    const year = url.searchParams.get("year") || "2025-26";

    // Financial year: April 1 to March 31
    const [startYear] = year.split("-").map(Number);
    const fyStart = `${startYear}-04-01T00:00:00.000Z`;
    const fyEnd = `${startYear + 1}-03-31T23:59:59.999Z`;

    const supabase = getServiceClient();

    // Fetch all paid subscriptions in this financial year
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("id, user_id, period, amount, paid_at, approved_at, payment_method, transaction_id, remarks, users!subscriptions_user_id_fkey(name, phone, posting_details)")
      .eq("status", "paid")
      .gte("paid_at", fyStart)
      .lte("paid_at", fyEnd)
      .order("paid_at", { ascending: true });

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/finance", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }

    // Build ledger entries
    let runningBalance = 0;
    const ledger = (subs || []).map((sub) => {
      const user = sub.users as unknown as { name: string; phone: string; posting_details: { regular_district?: string } | null };
      runningBalance += sub.amount || 0;
      return {
        id: sub.id,
        date: sub.paid_at,
        description: `Subscription - ${sub.period}`,
        member_name: user?.name || "Unknown",
        member_phone: user?.phone || "",
        district: user?.posting_details?.regular_district || "Unassigned",
        period: sub.period,
        credit: sub.amount || 0,
        debit: 0,
        balance: runningBalance,
        payment_method: sub.payment_method || "",
        transaction_id: sub.transaction_id || "",
        remarks: sub.remarks || "",
      };
    });

    // Summary by period
    const byPeriod: Record<string, { count: number; total: number }> = {};
    for (const entry of ledger) {
      if (!byPeriod[entry.period]) byPeriod[entry.period] = { count: 0, total: 0 };
      byPeriod[entry.period].count++;
      byPeriod[entry.period].total += entry.credit;
    }

    // Summary by district
    const byDistrict: Record<string, { count: number; total: number }> = {};
    for (const entry of ledger) {
      if (!byDistrict[entry.district]) byDistrict[entry.district] = { count: 0, total: 0 };
      byDistrict[entry.district].count++;
      byDistrict[entry.district].total += entry.credit;
    }

    // Monthly summary
    const byMonth: Record<string, { count: number; total: number }> = {};
    for (const entry of ledger) {
      const month = new Date(entry.date).toLocaleDateString("en-IN", { year: "numeric", month: "short" });
      if (!byMonth[month]) byMonth[month] = { count: 0, total: 0 };
      byMonth[month].count++;
      byMonth[month].total += entry.credit;
    }

    const summaryByPeriod = Object.entries(byPeriod).map(([period, v]) => ({ period, ...v })).sort((a, b) => b.total - a.total);
    const summaryByDistrict = Object.entries(byDistrict).map(([district, v]) => ({ district, ...v })).sort((a, b) => b.total - a.total);
    const summaryByMonth = Object.entries(byMonth).map(([month, v]) => ({ month, ...v }));

    // Members get abstract summary only (no ledger, no member names)
    if (!hasFullAccess) {
      return NextResponse.json({
        year,
        abstract: true,
        totalCredits: runningBalance,
        totalTransactions: ledger.length,
        byPeriod: summaryByPeriod,
        byMonth: summaryByMonth,
        districtsCount: Object.keys(byDistrict).length,
      });
    }

    // Full access: admins, state officials, DS/DJS
    return NextResponse.json({
      year,
      abstract: false,
      ledger,
      totalCredits: runningBalance,
      totalTransactions: ledger.length,
      byPeriod: summaryByPeriod,
      byDistrict: summaryByDistrict,
      byMonth: summaryByMonth,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/finance", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch finance data" }, { status: 500 });
  }
}
