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

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || new Date().getFullYear().toString();

    // Fetch all data in parallel
    const [usersRes, subsRes, contribRes, todosRes, eventsRsvpRes] = await Promise.all([
      supabase.from("users").select("id, name, posting_details, status, last_active_at, login_count, created_at")
        .eq("status", "approved")
        .neq("email", "tanhowa19791@gmail.com")
        .neq("email", "tanhowaadmin@tanhowa.in"),
      supabase.from("subscriptions").select("user_id, status, period, amount, paid_amount").like("period", `%${period}%`),
      supabase.from("contributions").select("user_id, estimated_minutes, created_at")
        .gte("created_at", `${period}-01-01`),
      supabase.from("todos").select("id, status, assigned_to, committed_by, created_at")
        .gte("created_at", `${period}-01-01`),
      supabase.from("event_rsvps").select("user_id, created_at")
        .gte("created_at", `${period}-01-01`),
    ]);

    const users = usersRes.data || [];
    const subs = subsRes.data || [];
    const contribs = contribRes.data || [];
    const todos = todosRes.data || [];
    const rsvps = eventsRsvpRes.data || [];

    // Helper: get district from user's posting_details
    function getDistrict(user: typeof users[0]): string {
      const pd = user.posting_details as Record<string, string> | null;
      return pd?.regular_district || pd?.special_duty_district || pd?.deputed_district || "Unknown";
    }

    // Group users by district
    const districtMap = new Map<string, {
      members: number;
      activeMembers: number;
      totalContribMinutes: number;
      subsPaid: number;
      subsTotal: number;
      collectionAmount: number;
      tasksCompleted: number;
      tasksAssigned: number;
      totalLogins: number;
      rsvpCount: number;
      newMembers: number;
    }>();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const userDistrictMap = new Map<string, string>();

    for (const u of users) {
      const district = getDistrict(u);
      userDistrictMap.set(u.id, district);

      if (!districtMap.has(district)) {
        districtMap.set(district, {
          members: 0, activeMembers: 0, totalContribMinutes: 0,
          subsPaid: 0, subsTotal: 0, collectionAmount: 0,
          tasksCompleted: 0, tasksAssigned: 0, totalLogins: 0,
          rsvpCount: 0, newMembers: 0,
        });
      }
      const d = districtMap.get(district)!;
      d.members++;
      if (u.last_active_at && new Date(u.last_active_at) >= thirtyDaysAgo) d.activeMembers++;
      d.totalLogins += (u.login_count || 0);
      if (u.created_at && new Date(u.created_at) >= new Date(`${period}-01-01`)) d.newMembers++;
    }

    // Subscriptions by district
    for (const s of subs) {
      const district = userDistrictMap.get(s.user_id) || "Unknown";
      const d = districtMap.get(district);
      if (!d) continue;
      d.subsTotal++;
      if (s.status === "paid") {
        d.subsPaid++;
        d.collectionAmount += (s.paid_amount || s.amount || 0);
      }
    }

    // Contributions by district
    for (const c of contribs) {
      const district = userDistrictMap.get(c.user_id) || "Unknown";
      const d = districtMap.get(district);
      if (d) d.totalContribMinutes += (c.estimated_minutes || 0);
    }

    // Tasks by district
    for (const t of todos) {
      const userId = t.committed_by || t.assigned_to;
      if (!userId) continue;
      const district = userDistrictMap.get(userId) || "Unknown";
      const d = districtMap.get(district);
      if (!d) continue;
      d.tasksAssigned++;
      if (t.status === "completed") d.tasksCompleted++;
    }

    // RSVPs by district
    for (const r of rsvps) {
      const district = userDistrictMap.get(r.user_id) || "Unknown";
      const d = districtMap.get(district);
      if (d) d.rsvpCount++;
    }

    // Build ranked results
    const districts = Array.from(districtMap.entries())
      .filter(([name]) => name !== "Unknown")
      .map(([name, data]) => ({
        name,
        ...data,
        paymentRate: data.subsTotal > 0 ? Math.round((data.subsPaid / data.subsTotal) * 100) : 0,
        activeRate: data.members > 0 ? Math.round((data.activeMembers / data.members) * 100) : 0,
        completionRate: data.tasksAssigned > 0 ? Math.round((data.tasksCompleted / data.tasksAssigned) * 100) : 0,
        avgContribMinutes: data.members > 0 ? Math.round(data.totalContribMinutes / data.members) : 0,
        avgLogins: data.members > 0 ? Math.round(data.totalLogins / data.members) : 0,
        // Composite score for ranking
        score: Math.round(
          (data.subsTotal > 0 ? (data.subsPaid / data.subsTotal) * 40 : 0) +
          (data.members > 0 ? (data.activeMembers / data.members) * 30 : 0) +
          (data.tasksAssigned > 0 ? (data.tasksCompleted / data.tasksAssigned) * 20 : 0) +
          (data.members > 0 ? Math.min(data.totalContribMinutes / data.members / 10, 10) : 0)
        ),
      }))
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({ districts, period });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/reports/district-benchmark", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
