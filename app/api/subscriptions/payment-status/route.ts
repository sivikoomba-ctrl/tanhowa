import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

function getDesignationRank(occupation: string): number {
  const o = (occupation || "").toLowerCase();
  if (o.includes("additional director")) return 1;  // ADDH
  if (o.includes("joint director")) return 2;       // JDH
  if (o.includes("deputy director")) return 3;      // DDH
  if (o.includes("assistant director")) return 4;   // ADH
  if (o.includes("horticultural officer") && !o.includes("retd")) return 5; // HO
  if (o.includes("retd")) return 6;
  return 7;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || new Date().getFullYear().toString();

    // Fetch all approved members and subscriptions in parallel
    const [usersRes, subsRes, periodsRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, name, occupation, posting_details, official_type")
        .eq("status", "approved")
        .neq("email", "tanhowa19791@gmail.com")
        .neq("email", "tanhowaadmin@tanhowa.in"),
      supabase
        .from("subscriptions")
        .select("user_id, status, amount, paid_amount, paid_at")
        .eq("period", period),
      supabase
        .from("subscriptions")
        .select("period")
        .order("period", { ascending: false }),
    ]);

    const users = usersRes.data || [];
    const subs = subsRes.data || [];

    // Available periods (deduplicated)
    const periodSet = new Set<string>();
    for (const p of periodsRes.data || []) {
      if (p.period) periodSet.add(p.period);
    }
    const periods = Array.from(periodSet).sort((a, b) => b.localeCompare(a));

    // Build subscription lookup by user_id
    const subByUser = new Map<string, { status: string; amount: number; paid_at: string | null }>();
    for (const s of subs) {
      // If user has multiple subs for same period, prefer paid > overdue > pending
      const existing = subByUser.get(s.user_id);
      if (!existing || (s.status === "paid" && existing.status !== "paid")) {
        subByUser.set(s.user_id, {
          status: s.status,
          amount: s.paid_amount || s.amount || 0,
          paid_at: s.paid_at || null,
        });
      }
    }

    // Group by district
    const districtMap = new Map<string, {
      members: { id: string; name: string; occupation: string; status: string; amount: number; paid_at: string | null; official_type: string | null }[];
    }>();

    let totalPaid = 0;
    let totalPending = 0;
    let totalOverdue = 0;
    let totalCollected = 0;

    for (const u of users) {
      const district = (u.posting_details as Record<string, string> | null)?.regular_district || "Unassigned";
      const sub = subByUser.get(u.id);
      const status = sub?.status || "none";
      const amount = sub?.amount || 0;

      if (!districtMap.has(district)) {
        districtMap.set(district, { members: [] });
      }

      districtMap.get(district)!.members.push({
        id: u.id,
        name: u.name || "",
        occupation: u.occupation || "",
        status,
        amount,
        paid_at: sub?.paid_at || null,
        official_type: u.official_type || null,
      });

      if (status === "paid") { totalPaid++; totalCollected += amount; }
      else if (status === "overdue") totalOverdue++;
      else if (status === "pending" || status === "hold") totalPending++;
      else totalPending++; // "none" = hasn't paid
    }

    // Build sorted district array
    const districts = Array.from(districtMap.entries())
      .map(([district, data]) => {
        // Sort members within district by designation rank
        data.members.sort((a, b) => {
          const rankA = getDesignationRank(a.occupation);
          const rankB = getDesignationRank(b.occupation);
          if (rankA !== rankB) return rankA - rankB;
          return (a.name || "").localeCompare(b.name || "");
        });

        const paidCount = data.members.filter(m => m.status === "paid").length;
        const pendingCount = data.members.filter(m => m.status !== "paid").length;
        const overdueCount = data.members.filter(m => m.status === "overdue").length;
        const collected = data.members.filter(m => m.status === "paid").reduce((s, m) => s + m.amount, 0);

        return {
          district,
          totalMembers: data.members.length,
          paidCount,
          pendingCount,
          overdueCount,
          collectedAmount: collected,
          paymentRate: data.members.length > 0 ? Math.round((paidCount / data.members.length) * 100) : 0,
          members: data.members,
        };
      })
      .sort((a, b) => a.district.localeCompare(b.district));

    // Top 5 districts by payment rate (min 3 members)
    const topDistricts = [...districts]
      .filter(d => d.totalMembers >= 3 && d.district !== "Unassigned")
      .sort((a, b) => b.paymentRate - a.paymentRate)
      .slice(0, 5)
      .map(d => ({ district: d.district, rate: d.paymentRate, paid: d.paidCount, total: d.totalMembers }));

    return NextResponse.json({
      districts,
      periods,
      summary: {
        totalMembers: users.length,
        paidCount: totalPaid,
        pendingCount: totalPending,
        overdueCount: totalOverdue,
        totalCollected,
        overallRate: users.length > 0 ? Math.round((totalPaid / users.length) * 100) : 0,
      },
      topDistricts,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions/payment-status", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch payment status" }, { status: 500 });
  }
}
