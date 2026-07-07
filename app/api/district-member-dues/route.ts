import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getOfficialInfo } from "@/lib/auth";
import { fetchAllRows } from "@/lib/supabase-helpers";
import { logError } from "@/lib/error-logger";

interface SubRow {
  id: string;
  user_id: string;
  period: string;
  amount: number;
  status: string;
  paid_amount: number | null;
  payment_proof_url: string | null;
}

interface FundRow {
  label: string;
  due: number;
  paid: number;
  extra: number;
  proofSubId: string | null;
}

/**
 * GET /api/district-member-dues
 * Per-member, per-fund breakdown (Due / Paid / Extra / Proof) sourced entirely
 * from real `subscriptions` rows — no self-reported social_links.dues_summary.
 * DS/DJS see only their own district; state officials and admins see all.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const info = await getOfficialInfo(session.userId);
    const isSuperAdmin = info.role === "super_admin";
    const isAdmin = info.role === "admin" || isSuperAdmin;
    const isState = info.official_type === "state";
    const isDistrict = info.official_type === "district" && !!info.district;

    if (!isAdmin && !isState && !isDistrict) {
      return NextResponse.json({ error: "Officials and admins only" }, { status: 403 });
    }

    const isDistrictRestricted = isDistrict && !isState && !isSuperAdmin;
    const userDistrict = info.district || null;

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const districtFilter = url.searchParams.get("district");

    const { data: users, error: usersErr } = await supabase
      .from("users")
      .select("id, name, phone, occupation, posting_details")
      .eq("status", "approved")
      .neq("email", "tanhowa19791@gmail.com")
      .order("name");

    if (usersErr) {
      await logError({ type: "api", message: usersErr.message, path: "/api/district-member-dues", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
    }

    const subs = await fetchAllRows<SubRow>((from, to) =>
      supabase
        .from("subscriptions")
        .select("id, user_id, period, amount, status, paid_amount, payment_proof_url")
        .range(from, to)
    );

    const subsByUser: Record<string, SubRow[]> = {};
    for (const s of subs) {
      if (!subsByUser[s.user_id]) subsByUser[s.user_id] = [];
      subsByUser[s.user_id].push(s);
    }

    function buildFund(label: string, rows: SubRow[]): FundRow {
      const due = rows.reduce((sum, s) => sum + (s.amount || 0), 0);
      const paid = rows
        .filter((s) => s.status === "paid")
        .reduce((sum, s) => sum + (s.paid_amount ?? s.amount ?? 0), 0);
      const withProof = rows.find((s) => s.payment_proof_url);
      return {
        label,
        due,
        paid,
        extra: Math.max(0, paid - due),
        proofSubId: withProof ? withProof.id : null,
      };
    }

    const districts: Record<string, {
      district: string;
      members: {
        id: string;
        name: string;
        designation: string;
        phone: string;
        totalDue: number;
        totalPaid: number;
        totalExtra: number;
        funds: FundRow[];
      }[];
    }> = {};

    for (const u of users || []) {
      const pd = (u.posting_details || {}) as Record<string, string>;
      const district = pd.regular_district || "Unassigned";

      if (isDistrictRestricted && district !== userDistrict) continue;
      if (districtFilter && districtFilter !== "all" && district !== districtFilter) continue;

      const mySubs = subsByUser[u.id] || [];
      const upTo2025 = mySubs.filter((s) => /^20(1[0-9]|2[0-5])$/.test(s.period || ""));
      const y2026 = mySubs.filter((s) => s.period === "2026");
      const specialPeriods = [...new Set(mySubs.filter((s) => !/^\d{4}$/.test(s.period || "")).map((s) => s.period))];

      const funds: FundRow[] = [
        buildFund("Annual Subscription (up to 2025)", upTo2025),
        buildFund("Annual Subscription (2026)", y2026),
        ...specialPeriods.map((p) => {
          const cleaned = (p || "").replace(/^For\s+/i, "").replace(/\s+Case\s+(\d{4})$/i, " ($1)");
          return buildFund(
            cleaned.toLowerCase() === "special amount" ? "Special Fund" : `Special Fund – ${cleaned}`,
            mySubs.filter((s) => s.period === p)
          );
        }),
      ];

      const totalDue = funds.reduce((sum, f) => sum + f.due, 0);
      const totalPaid = funds.reduce((sum, f) => sum + f.paid, 0);
      const totalExtra = funds.reduce((sum, f) => sum + f.extra, 0);

      if (!districts[district]) districts[district] = { district, members: [] };
      districts[district].members.push({
        id: u.id,
        name: u.name || "",
        designation: (u.occupation || "") + (pd.official_designation ? ` / ${pd.official_designation}` : ""),
        phone: u.phone || "",
        totalDue,
        totalPaid,
        totalExtra,
        funds,
      });
    }

    const result = Object.values(districts)
      .sort((a, b) => a.district.localeCompare(b.district))
      .map((d) => ({
        ...d,
        members: d.members.sort((a, b) => a.name.localeCompare(b.name)),
        totalMembers: d.members.length,
        totalDue: d.members.reduce((sum, m) => sum + m.totalDue, 0),
        totalPaid: d.members.reduce((sum, m) => sum + m.totalPaid, 0),
      }));

    return NextResponse.json({ districts: result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/district-member-dues", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch district member dues" }, { status: 500 });
  }
}
