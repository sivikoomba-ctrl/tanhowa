import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getOfficialInfo } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

/**
 * GET /api/subscriptions/district-pending
 *
 * For state officials & admins: returns pending subscriptions grouped by district,
 * with the district secretary/joint secretary responsible for each.
 *
 * For district officials: returns pending subscriptions in their district only.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const info = await getOfficialInfo(session.userId);
    const isAdmin = info.role === "admin" || info.role === "super_admin";
    const isState = info.official_type === "state";
    const isDistrict = info.official_type === "district" && !!info.district;

    if (!isAdmin && !isState && !isDistrict) {
      return NextResponse.json({ error: "Officials and admins only" }, { status: 403 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const period = url.searchParams.get("period");

    // Fetch pending/overdue subscriptions with member posting_details
    let query = supabase
      .from("subscriptions")
      .select("id, user_id, period, amount, status, payment_proof_url, remarks, created_at, users!subscriptions_user_id_fkey(name, email, phone, posting_details, official_type)")
      .in("status", ["pending", "overdue"])
      .not("payment_proof_url", "is", null) // Only show those who uploaded proof
      .order("created_at", { ascending: false });

    if (period && period !== "all") {
      query = query.eq("period", period);
    }

    const { data: subs, error } = await query;

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/subscriptions/district-pending", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }

    // Fetch all district officials (DS/DJS)
    const { data: officials } = await supabase
      .from("users")
      .select("id, name, email, phone, official_type, posting_details")
      .eq("official_type", "district")
      .eq("status", "approved");

    // Build district → officials map
    const districtOfficials: Record<string, { id: string; name: string; email: string; phone: string }[]> = {};
    for (const o of officials || []) {
      const pd = o.posting_details as { regular_district?: string } | null;
      const dist = pd?.regular_district;
      if (dist) {
        if (!districtOfficials[dist]) districtOfficials[dist] = [];
        districtOfficials[dist].push({ id: o.id, name: o.name, email: o.email, phone: o.phone });
      }
    }

    // Group subscriptions by district
    const byDistrict: Record<string, {
      district: string;
      pending: number;
      totalAmount: number;
      officials: { id: string; name: string; email: string; phone: string }[];
      subscriptions: {
        id: string;
        user_id: string;
        member_name: string;
        member_phone: string;
        period: string;
        amount: number;
        status: string;
        payment_proof_url: string | null;
        remarks: string | null;
      }[];
    }> = {};

    for (const sub of subs || []) {
      const user = sub.users as unknown as { name: string; email: string; phone: string; posting_details: { regular_district?: string } | null; official_type: string | null };
      const memberDistrict = user?.posting_details?.regular_district || "Unassigned";

      // District official: only see their district
      if (isDistrict && !isAdmin && memberDistrict !== info.district) continue;

      if (!byDistrict[memberDistrict]) {
        byDistrict[memberDistrict] = {
          district: memberDistrict,
          pending: 0,
          totalAmount: 0,
          officials: districtOfficials[memberDistrict] || [],
          subscriptions: [],
        };
      }

      byDistrict[memberDistrict].pending++;
      byDistrict[memberDistrict].totalAmount += sub.amount || 0;
      byDistrict[memberDistrict].subscriptions.push({
        id: sub.id,
        user_id: sub.user_id,
        member_name: user?.name || "Unknown",
        member_phone: user?.phone || "",
        period: sub.period,
        amount: sub.amount || 0,
        status: sub.status,
        payment_proof_url: sub.payment_proof_url,
        remarks: sub.remarks || null,
      });
    }

    // Get unique periods for filter
    const periods = [...new Set((subs || []).map((s) => s.period))].sort().reverse();

    return NextResponse.json({
      districts: Object.values(byDistrict).sort((a, b) => b.pending - a.pending),
      periods,
      totalPending: (subs || []).length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions/district-pending", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
