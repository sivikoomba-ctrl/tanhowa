import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getOfficialInfo } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { isGrievanceCategory, hasGrievanceAccess } from "@/lib/grievances";
import { fetchAllRows } from "@/lib/supabase-helpers";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();

    // Run all queries in parallel. Tables that can exceed 1000 rows (subscriptions,
    // todos) are paged via fetchAllRows so client-side counts/sums don't truncate.
    const [
      membersRes,
      pendingRes,
      activeRes,
      subs,
      taskStatuses,
      grievancesRes,
      contributionsRes,
    ] = await Promise.all([
      // Total approved members
      supabase.from("users").select("id, created_at, last_active_at, role", { count: "exact" }).eq("status", "approved").neq("email", "tanhowa19791@gmail.com"),
      // Pending members
      supabase.from("users").select("id", { count: "exact", head: true }).eq("status", "pending"),
      // Active in last 7 days
      supabase.from("users").select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .neq("email", "tanhowa19791@gmail.com")
        .gte("last_active_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      // Subscriptions summary (all rows, paged)
      fetchAllRows<{ status: string; amount: number; period: string }>((f, t) =>
        supabase.from("subscriptions").select("status, amount, period").range(f, t)),
      // Tasks by status (all rows, paged)
      fetchAllRows<{ status: string }>((f, t) =>
        supabase.from("todos").select("status").range(f, t)),
      // Grievances/suggestions
      supabase.from("grievances").select("id, category, status, district", { count: "exact" }),
      // Contributions this month
      supabase.from("contributions").select("id, estimated_minutes", { count: "exact" })
        .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]);

    // Member stats
    const members = membersRes.data || [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const newMembersThisMonth = members.filter(m => new Date(m.created_at) >= monthStart).length;

    // Subscription stats by period
    const periodStats = new Map<string, { paid: number; pending: number; overdue: number; hold: number; rejected: number; collected: number }>();
    for (const s of subs) {
      if (!periodStats.has(s.period)) periodStats.set(s.period, { paid: 0, pending: 0, overdue: 0, hold: 0, rejected: 0, collected: 0 });
      const ps = periodStats.get(s.period)!;
      if (s.status === "paid") { ps.paid++; ps.collected += s.amount || 0; }
      else if (s.status === "pending") ps.pending++;
      else if (s.status === "overdue") ps.overdue++;
      else if (s.status === "hold") ps.hold++;
      else if (s.status === "rejected") ps.rejected++;
    }
    const collectionByPeriod = Array.from(periodStats.entries())
      .map(([period, stats]) => ({ period, ...stats, total: stats.paid + stats.pending + stats.overdue + stats.hold + stats.rejected }))
      .sort((a, b) => b.period.localeCompare(a.period));

    const totalCollected = subs.filter(s => s.status === "paid").reduce((sum, s) => sum + (s.amount || 0), 0);
    const collectionRate = subs.length > 0 ? Math.round((subs.filter(s => s.status === "paid").length / subs.length) * 100) : 0;

    // Task stats
    const taskBreakdown: Record<string, number> = {};
    for (const t of taskStatuses) {
      taskBreakdown[t.status] = (taskBreakdown[t.status] || 0) + 1;
    }
    const totalTasks = taskStatuses.length;
    const completedTasks = taskBreakdown["completed"] || 0;
    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Grievance stats — grievance-kind rows scoped to the caller's access
    // (state/super: all; district admin: own district; others: none),
    // matching what /admin/grievances will actually show them
    const grievances = grievancesRes.data || [];
    const suggestions = grievances.filter(g => g.category === "Suggestion");
    const info = await getOfficialInfo(session.userId);
    let grievanceOnly = grievances.filter(g => isGrievanceCategory(g.category));
    if (!hasGrievanceAccess(info)) {
      grievanceOnly = info.official_type === "district" && info.district
        ? grievanceOnly.filter(g => g.district === info.district)
        : [];
    }
    const resolvedGrievances = grievanceOnly.filter(g => g.status === "resolved").length;
    const grievanceResolutionRate = grievanceOnly.length > 0 ? Math.round((resolvedGrievances / grievanceOnly.length) * 100) : 0;

    // Contributions
    const contribMinutes = (contributionsRes.data || []).reduce((sum, c) => sum + c.estimated_minutes, 0);

    // Inactive members (no activity in 30+ days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const inactive = members.filter(m => !m.last_active_at || new Date(m.last_active_at) < thirtyDaysAgo).length;

    return NextResponse.json({
      members: {
        total: membersRes.count || 0,
        pending: pendingRes.count || 0,
        activeThisWeek: activeRes.count || 0,
        newThisMonth: newMembersThisMonth,
        inactive,
      },
      subscriptions: {
        totalCollected,
        collectionRate,
        byPeriod: collectionByPeriod,
      },
      tasks: {
        total: totalTasks,
        completionRate: taskCompletionRate,
        breakdown: taskBreakdown,
      },
      grievances: {
        total: grievanceOnly.length,
        suggestions: suggestions.length,
        resolutionRate: grievanceResolutionRate,
      },
      contributions: {
        actionsThisMonth: contributionsRes.count || 0,
        minutesThisMonth: contribMinutes,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/reports/overview", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
