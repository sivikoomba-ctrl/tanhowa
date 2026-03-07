import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

interface DistrictRow {
  district: string;
  members: number;
  [period: string]: string | number;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();

    // Fetch all paid subscriptions with user posting details
    const { data: paidSubs } = await supabase
      .from("subscriptions")
      .select("amount, period, user_id, users(posting_details)")
      .eq("status", "paid");

    // Fetch all approved members with their districts
    const { data: allMembers } = await supabase
      .from("users")
      .select("id, posting_details")
      .eq("status", "approved")
      .neq("role", "admin");

    // Count members per district
    const districtMembers = new Map<string, number>();
    for (const m of allMembers || []) {
      const pd = m.posting_details as { regular_district?: string } | null;
      const district = pd?.regular_district || "Unassigned";
      districtMembers.set(district, (districtMembers.get(district) || 0) + 1);
    }

    // Collect all periods and aggregate by district + period
    const periods = new Set<string>();
    const districtPeriodTotals = new Map<string, Map<string, number>>();

    for (const sub of paidSubs || []) {
      const user = sub.users as unknown as { posting_details?: { regular_district?: string } } | null;
      const district = user?.posting_details?.regular_district || "Unassigned";
      const period = sub.period;
      const amount = sub.amount || 0;

      periods.add(period);

      if (!districtPeriodTotals.has(district)) {
        districtPeriodTotals.set(district, new Map());
      }
      const periodMap = districtPeriodTotals.get(district)!;
      periodMap.set(period, (periodMap.get(period) || 0) + amount);
    }

    // Build rows sorted by district name
    const sortedPeriods = Array.from(periods).sort();
    const allDistricts = new Set([...districtMembers.keys(), ...districtPeriodTotals.keys()]);
    const rows: DistrictRow[] = Array.from(allDistricts)
      .sort((a, b) => (a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b)))
      .map((district) => {
        const row: DistrictRow = {
          district,
          members: districtMembers.get(district) || 0,
        };
        let total = 0;
        for (const p of sortedPeriods) {
          const val = districtPeriodTotals.get(district)?.get(p) || 0;
          row[p] = val;
          total += val;
        }
        row.total = total;
        return row;
      });

    // Grand totals
    const grandTotal: DistrictRow = { district: "TOTAL", members: 0 };
    let grandSum = 0;
    for (const p of sortedPeriods) {
      grandTotal[p] = 0;
    }
    for (const row of rows) {
      grandTotal.members += row.members;
      for (const p of sortedPeriods) {
        (grandTotal[p] as number) += (row[p] as number) || 0;
      }
      grandSum += (row.total as number) || 0;
    }
    grandTotal.total = grandSum;

    return NextResponse.json({ rows, periods: sortedPeriods, grandTotal });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions/district-report", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
