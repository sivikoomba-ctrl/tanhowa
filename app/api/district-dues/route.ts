import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getOfficialInfo } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

/**
 * GET /api/district-dues
 * Returns members with subscription dues for DS/DJS's district (or all districts for admins).
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

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const districtFilter = url.searchParams.get("district");

    // Non-super admins with a district are restricted to their district only
    let userDistrict: string | null = info.district || null;
    if (isAdmin && !isSuperAdmin && !isState && !userDistrict) {
      const { data: adminUser } = await supabase.from("users").select("posting_details").eq("id", session.userId).single();
      const apd = (adminUser?.posting_details || {}) as Record<string, string>;
      userDistrict = apd.regular_district || null;
    }
    const isDistrictRestricted = !isSuperAdmin && !isState && !!userDistrict;

    // Fetch approved members
    const { data: users, error: usersErr } = await supabase
      .from("users")
      .select("id, name, phone, occupation, posting_details, social_links, official_type")
      .eq("status", "approved")
      .neq("email", "tanhowa19791@gmail.com")
      .order("name");

    if (usersErr) {
      await logError({ type: "api", message: usersErr.message, path: "/api/district-dues", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }

    // Fetch all subscriptions
    const { data: subs, error: subsErr } = await supabase
      .from("subscriptions")
      .select("user_id, period, amount, status, paid_amount");

    if (subsErr) {
      await logError({ type: "api", message: subsErr.message, path: "/api/district-dues", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }

    // Build per-user subscription aggregates
    const userSubs: Record<string, { dues2025: number; dues2026: number; duesUatt: number; totalPaidSystem: number }> = {};
    for (const s of subs || []) {
      if (!userSubs[s.user_id]) userSubs[s.user_id] = { dues2025: 0, dues2026: 0, duesUatt: 0, totalPaidSystem: 0 };
      const us = userSubs[s.user_id];
      const period = s.period || "";
      if (/^20(1[0-9]|2[0-5])$/.test(period)) {
        us.dues2025 += s.amount || 0;
      } else if (period === "2026") {
        us.dues2026 += s.amount || 0;
      } else if (period.toLowerCase().includes("uatt")) {
        us.duesUatt += s.amount || 0;
      }
      if (s.status === "paid") {
        us.totalPaidSystem += s.paid_amount || s.amount || 0;
      }
    }

    // Build response — group by district
    type MemberRow = {
      id: string;
      name: string;
      designation: string;
      phone: string;
      district: string;
      dues2025: number;
      dues2026: number;
      duesUatt: number;
      totalToPay: number;
      amountPaid: number;
      pendingAmount: number;
      additionalMoney: number;
      proofUrl: string | null;
    };

    const districts: Record<string, MemberRow[]> = {};

    for (const u of users || []) {
      const pd = (u.posting_details || {}) as Record<string, string>;
      const district = pd.regular_district || "Unassigned";

      // Filter: DS/DJS and district-restricted admins only see their district
      if (isDistrictRestricted && district !== userDistrict) continue;
      // Optional district filter param
      if (districtFilter && districtFilter !== "all" && district !== districtFilter) continue;

      const us = userSubs[u.id] || { dues2025: 0, dues2026: 0, duesUatt: 0, totalPaidSystem: 0 };
      const sl = (u.social_links || {}) as Record<string, unknown>;
      const ds = (sl.dues_summary || {}) as Record<string, unknown>;

      const amountPaid = ds.amount_paid != null ? Number(ds.amount_paid) : us.totalPaidSystem;
      const additionalMoney = ds.additional_money != null ? Number(ds.additional_money) : 0;
      const totalToPay = us.dues2025 + us.dues2026 + us.duesUatt;

      if (!districts[district]) districts[district] = [];
      districts[district].push({
        id: u.id,
        name: u.name || "",
        designation: ((u.occupation || "") + (pd.official_designation ? ` / ${pd.official_designation}` : "")) as string,
        phone: u.phone || "",
        district,
        dues2025: us.dues2025,
        dues2026: us.dues2026,
        duesUatt: us.duesUatt,
        totalToPay,
        amountPaid,
        pendingAmount: totalToPay - amountPaid,
        additionalMoney,
        proofUrl: (ds.proof_url as string) || null,
      });
    }

    // Sort districts alphabetically, members by name within district
    const result = Object.entries(districts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([district, members]) => ({
        district,
        members: members.sort((a, b) => a.name.localeCompare(b.name)),
        totalMembers: members.length,
        totalToPay: members.reduce((s, m) => s + m.totalToPay, 0),
        totalPaid: members.reduce((s, m) => s + m.amountPaid, 0),
        totalPending: members.reduce((s, m) => s + Math.max(0, m.pendingAmount), 0),
        totalAdditional: members.reduce((s, m) => s + m.additionalMoney, 0),
      }));

    return NextResponse.json({ districts: result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/district-dues", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

/**
 * PUT /api/district-dues
 * DS/DJS updates a member's dues summary (amount_paid, additional_money).
 */
export async function PUT(req: NextRequest) {
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

    const { user_id, amount_paid, additional_money } = await req.json();
    if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

    const supabase = getServiceClient();

    // District-restricted: DS/DJS or non-super admins with a district
    let userDistrict: string | null = info.district || null;
    if (isAdmin && !isSuperAdmin && !isState && !userDistrict) {
      const { data: adminUser } = await supabase.from("users").select("posting_details").eq("id", session.userId).single();
      const apd = (adminUser?.posting_details || {}) as Record<string, string>;
      userDistrict = apd.regular_district || null;
    }
    if (!isSuperAdmin && !isState && userDistrict) {
      const { data: member } = await supabase.from("users").select("posting_details").eq("id", user_id).single();
      const pd = (member?.posting_details || {}) as Record<string, string>;
      if (pd.regular_district !== userDistrict) {
        return NextResponse.json({ error: "Member not in your district" }, { status: 403 });
      }
    }

    // Get current social_links
    const { data: user } = await supabase.from("users").select("social_links").eq("id", user_id).single();
    const currentLinks = (user?.social_links || {}) as Record<string, unknown>;
    const currentDues = (currentLinks.dues_summary || {}) as Record<string, unknown>;

    const updatedLinks = {
      ...currentLinks,
      dues_summary: {
        ...currentDues,
        ...(amount_paid != null ? { amount_paid: Number(amount_paid) } : {}),
        ...(additional_money != null ? { additional_money: Number(additional_money) } : {}),
      },
    };

    const { error } = await supabase.from("users").update({ social_links: updatedLinks }).eq("id", user_id);
    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/district-dues", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/district-dues", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
