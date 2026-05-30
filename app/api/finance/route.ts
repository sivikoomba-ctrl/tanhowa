import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getOfficialInfo } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

/**
 * GET /api/finance?year=2025-26
 *
 * Full ledger: admins, state officials
 * District-scoped ledger: district officials (DS/DJS)
 * Abstract summary only: regular members
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await isAdmin(session);
    const officialInfo = await getOfficialInfo(session.userId);
    const isStateOfficial = officialInfo.official_type === "state";
    const isDistrictOfficial = officialInfo.official_type === "district" && !!officialInfo.district;
    const hasFullAccess = admin || isStateOfficial || isDistrictOfficial;

    const url = new URL(req.url);
    const year = url.searchParams.get("year") || "2026-27";

    // Financial year: April 1 to March 31
    const [startYear] = year.split("-").map(Number);
    const fyStart = `${startYear}-04-01T00:00:00.000Z`;
    const fyEnd = `${startYear + 1}-03-31T23:59:59.999Z`;

    const supabase = getServiceClient();

    // Fetch all paid subscriptions in this financial year
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("id, user_id, period, amount, paid_at, approved_at, payment_method, transaction_id, remarks, payment_group_id, users!subscriptions_user_id_fkey(name, phone, posting_details)")
      .eq("status", "paid")
      .gte("paid_at", fyStart)
      .lte("paid_at", fyEnd)
      .order("paid_at", { ascending: true });

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/finance", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }

    // Build ledger entries — consolidate grouped payments (same payment_group_id) into single rows
    const allSubs = (subs || []).filter((sub) => {
      if (!isDistrictOfficial || admin || isStateOfficial) return true;
      const user = sub.users as unknown as { posting_details: { regular_district?: string } | null };
      return user?.posting_details?.regular_district === officialInfo.district;
    });

    // Separate grouped and ungrouped subscriptions
    const groupedMap = new Map<string, typeof allSubs>();
    const ungrouped: typeof allSubs = [];

    for (const sub of allSubs) {
      if (sub.payment_group_id) {
        const existing = groupedMap.get(sub.payment_group_id) || [];
        existing.push(sub);
        groupedMap.set(sub.payment_group_id, existing);
      } else {
        ungrouped.push(sub);
      }
    }

    // Build consolidated entries: one row per ungrouped sub, one row per payment group
    interface RawLedgerEntry {
      id: string;
      date: string;
      description: string;
      member_name: string;
      member_phone: string;
      district: string;
      period: string;
      credit: number;
      debit: number;
      balance: number;
      payment_method: string;
      transaction_id: string;
      remarks: string;
      payment_group_id: string | null;
      linked_members: { name: string; period: string; amount: number; district: string }[];
    }

    const rawEntries: RawLedgerEntry[] = [];

    // Ungrouped: one row each
    for (const sub of ungrouped) {
      const user = sub.users as unknown as { name: string; phone: string; posting_details: { regular_district?: string } | null };
      rawEntries.push({
        id: sub.id,
        date: sub.paid_at,
        description: `Subscription - ${sub.period}`,
        member_name: user?.name || "Unknown",
        member_phone: user?.phone || "",
        district: user?.posting_details?.regular_district || "Unassigned",
        period: sub.period,
        credit: sub.amount || 0,
        debit: 0,
        balance: 0,
        payment_method: sub.payment_method || "",
        transaction_id: sub.transaction_id || "",
        remarks: sub.remarks || "",
        payment_group_id: null,
        linked_members: [],
      });
    }

    // Grouped: one consolidated row per payment_group_id
    for (const [groupId, groupSubs] of groupedMap) {
      const totalAmount = groupSubs.reduce((sum, s) => sum + (s.amount || 0), 0);
      // Use the earliest paid_at as the transaction date
      const sortedByDate = [...groupSubs].sort((a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime());
      const primary = sortedByDate[0];
      const primaryUser = primary.users as unknown as { name: string; phone: string; posting_details: { regular_district?: string } | null };

      const periods = [...new Set(groupSubs.map((s) => s.period))];
      const memberNames = [...new Set(groupSubs.map((s) => {
        const u = s.users as unknown as { name: string };
        return u?.name || "Unknown";
      }))];

      const otherCount = groupSubs.length - 1;
      const displayName = otherCount > 0
        ? `${primaryUser?.name || "Unknown"} (+${otherCount} member${otherCount > 1 ? "s" : ""})`
        : primaryUser?.name || "Unknown";

      const description = memberNames.length > 1
        ? `Bulk Payment - ${periods.join(", ")}`
        : `Split Payment - ${periods.join(", ")}`;

      const linkedMembers = groupSubs.map((s) => {
        const u = s.users as unknown as { name: string; posting_details: { regular_district?: string } | null };
        return {
          name: u?.name || "Unknown",
          period: s.period,
          amount: s.amount || 0,
          district: u?.posting_details?.regular_district || "Unassigned",
        };
      });

      rawEntries.push({
        id: primary.id,
        date: primary.paid_at,
        description,
        member_name: displayName,
        member_phone: primaryUser?.phone || "",
        district: primaryUser?.posting_details?.regular_district || "Unassigned",
        period: periods.join(", "),
        credit: totalAmount,
        debit: 0,
        balance: 0,
        payment_method: primary.payment_method || "",
        transaction_id: primary.transaction_id || "",
        remarks: primary.remarks || "",
        payment_group_id: groupId,
        linked_members: linkedMembers,
      });
    }

    // Sort by date and compute running balance
    rawEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let runningBalance = 0;
    const ledger = rawEntries.map((entry) => {
      runningBalance += entry.credit;
      return { ...entry, balance: runningBalance };
    });

    // Summaries use individual subscriptions (not consolidated ledger) for accurate counts
    const byPeriod: Record<string, { count: number; total: number }> = {};
    for (const sub of allSubs) {
      const period = sub.period;
      if (!byPeriod[period]) byPeriod[period] = { count: 0, total: 0 };
      byPeriod[period].count++;
      byPeriod[period].total += sub.amount || 0;
    }

    const byDistrict: Record<string, { count: number; total: number }> = {};
    for (const sub of allSubs) {
      const user = sub.users as unknown as { posting_details: { regular_district?: string } | null };
      const district = user?.posting_details?.regular_district || "Unassigned";
      if (!byDistrict[district]) byDistrict[district] = { count: 0, total: 0 };
      byDistrict[district].count++;
      byDistrict[district].total += sub.amount || 0;
    }

    const byMonth: Record<string, { count: number; total: number }> = {};
    for (const sub of allSubs) {
      const month = new Date(sub.paid_at).toLocaleDateString("en-IN", { year: "numeric", month: "short" });
      if (!byMonth[month]) byMonth[month] = { count: 0, total: 0 };
      byMonth[month].count++;
      byMonth[month].total += sub.amount || 0;
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
        totalSubscriptions: allSubs.length,
        totalBankEntries: ledger.length,
        byPeriod: summaryByPeriod,
        byMonth: summaryByMonth,
        districtsCount: Object.keys(byDistrict).length,
      });
    }

    // Full access: admins, state officials, district-scoped DS/DJS
    return NextResponse.json({
      year,
      abstract: false,
      ledger,
      totalCredits: runningBalance,
      totalSubscriptions: allSubs.length,
      totalBankEntries: ledger.length,
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
