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
    const period = url.searchParams.get("period") || "month";
    const teamFilter = url.searchParams.get("team") || "all";

    // Calculate date range
    const now = new Date();
    let sinceDate: string | null = null;
    if (period === "month") {
      sinceDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    } else if (period === "3months") {
      sinceDate = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
    } else if (period === "6months") {
      sinceDate = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString();
    }
    // "all" → no date filter

    // Build queries
    let todosQuery = supabase
      .from("todos")
      .select("id, status, assigned_team_id, assigned_to, committed_by, submitted_by, due_date, completed_at, created_at, timebox_hours");
    if (sinceDate) todosQuery = todosQuery.gte("created_at", sinceDate);

    let timeQuery = supabase
      .from("todo_time_entries")
      .select("todo_id, user_id, hours, logged_at");
    if (sinceDate) timeQuery = timeQuery.gte("logged_at", sinceDate);

    let contribQuery = supabase
      .from("contributions")
      .select("user_id, estimated_minutes, action, created_at");
    if (sinceDate) contribQuery = contribQuery.gte("created_at", sinceDate);

    const currentYear = now.getFullYear().toString();

    // Run all queries in parallel
    const [teamsRes, teamMembersRes, todosRes, timeRes, contribRes, subsRes, usersRes] = await Promise.all([
      supabase.from("teams").select("id, name, icon, sort_order").order("sort_order", { ascending: true }),
      supabase.from("team_members").select("team_id, user_id, role"),
      todosQuery,
      timeQuery,
      contribQuery,
      supabase.from("subscriptions").select("user_id, status, period").like("period", `%${currentYear}%`),
      supabase.from("users").select("id, name, email, photo_url, role, official_type, last_active_at, login_count")
        .eq("status", "approved")
        .neq("email", "tanhowa19791@gmail.com"),
    ]);

    const teams = teamsRes.data || [];
    const teamMembers = teamMembersRes.data || [];
    const todos = todosRes.data || [];
    const timeEntries = timeRes.data || [];
    const contributions = contribRes.data || [];
    const subscriptions = subsRes.data || [];
    const users = usersRes.data || [];

    // Build lookup maps
    const userMap = new Map(users.map(u => [u.id, u]));
    const teamMembersByTeam = new Map<string, string[]>();
    const userTeams = new Map<string, string[]>();
    for (const tm of teamMembers) {
      if (!teamMembersByTeam.has(tm.team_id)) teamMembersByTeam.set(tm.team_id, []);
      teamMembersByTeam.get(tm.team_id)!.push(tm.user_id);
      if (!userTeams.has(tm.user_id)) userTeams.set(tm.user_id, []);
      const team = teams.find(t => t.id === tm.team_id);
      if (team) userTeams.get(tm.user_id)!.push(team.name);
    }

    // Time entries by user
    const hoursByUser = new Map<string, number>();
    for (const te of timeEntries) {
      hoursByUser.set(te.user_id, (hoursByUser.get(te.user_id) || 0) + (te.hours || 0));
    }

    // Contributions by user
    const contribByUser = new Map<string, { minutes: number; count: number }>();
    for (const c of contributions) {
      const prev = contribByUser.get(c.user_id) || { minutes: 0, count: 0 };
      prev.minutes += c.estimated_minutes || 0;
      prev.count += 1;
      contribByUser.set(c.user_id, prev);
    }

    // Subscription compliance by user (any paid sub in current year)
    const subCompliant = new Set<string>();
    for (const s of subscriptions) {
      if (s.status === "paid") subCompliant.add(s.user_id);
    }

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // --- Team performance ---
    const teamPerformance = teams.map(team => {
      const memberIds = teamMembersByTeam.get(team.id) || [];
      const memberIdSet = new Set(memberIds);
      const teamTodos = todos.filter(t => t.assigned_team_id === team.id);
      const completedTodos = teamTodos.filter(t => t.status === "completed");

      let totalHours = 0;
      let contribMinutes = 0;
      let activeCount = 0;
      for (const mid of memberIds) {
        totalHours += hoursByUser.get(mid) || 0;
        contribMinutes += (contribByUser.get(mid)?.minutes || 0);
        const u = userMap.get(mid);
        if (u?.last_active_at && new Date(u.last_active_at) >= thirtyDaysAgo) activeCount++;
      }

      return {
        id: team.id,
        name: team.name,
        icon: team.icon || "",
        tasksAssigned: teamTodos.length,
        tasksCompleted: completedTodos.length,
        completionRate: teamTodos.length > 0 ? Math.round((completedTodos.length / teamTodos.length) * 100) : 0,
        totalHoursLogged: Math.round(totalHours * 10) / 10,
        contributionMinutes: contribMinutes,
        activeMembers: activeCount,
        totalMembers: memberIds.length,
      };
    });

    // Filter by team if specified
    const filteredTeams = teamFilter !== "all"
      ? teamPerformance.filter(t => t.id === teamFilter)
      : teamPerformance;

    // --- Member performance ---
    const memberPerformance = users.map(user => {
      const committed = todos.filter(t => t.committed_by === user.id);
      const completedByUser = committed.filter(t => t.status === "completed");
      const submitted = todos.filter(t => t.submitted_by === user.id);
      const hours = hoursByUser.get(user.id) || 0;
      const contrib = contribByUser.get(user.id) || { minutes: 0, count: 0 };

      return {
        id: user.id,
        name: user.name || "",
        email: user.email,
        photo_url: user.photo_url || null,
        role: user.role,
        official_type: user.official_type || null,
        teamNames: userTeams.get(user.id) || [],
        tasksCommitted: committed.length,
        tasksCompleted: completedByUser.length,
        tasksSubmitted: submitted.length,
        hoursLogged: Math.round(hours * 10) / 10,
        contributionScore: contrib.minutes,
        actionCount: contrib.count,
        loginCount: user.login_count || 0,
        lastActive: user.last_active_at || null,
        subscriptionCompliant: subCompliant.has(user.id),
      };
    });

    // Filter members by team if specified
    const filteredMembers = teamFilter !== "all"
      ? memberPerformance.filter(m => {
          const memberTeamIds = teamMembers.filter(tm => tm.user_id === m.id).map(tm => tm.team_id);
          return memberTeamIds.includes(teamFilter);
        })
      : memberPerformance;

    // Sort by composite score
    filteredMembers.sort((a, b) => {
      const scoreA = (a.tasksCompleted * 10) + a.hoursLogged + (a.contributionScore / 60);
      const scoreB = (b.tasksCompleted * 10) + b.hoursLogged + (b.contributionScore / 60);
      return scoreB - scoreA;
    });

    // --- Completion trend (monthly) ---
    const trendMap = new Map<string, { completed: number; assigned: number }>();
    for (const t of todos) {
      const month = t.created_at?.slice(0, 7); // "2026-01"
      if (!month) continue;
      if (!trendMap.has(month)) trendMap.set(month, { completed: 0, assigned: 0 });
      trendMap.get(month)!.assigned++;
      if (t.status === "completed") trendMap.get(month)!.completed++;
    }
    const completionTrend = Array.from(trendMap.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // --- Summary ---
    const totalAssigned = todos.length;
    const totalCompleted = todos.filter(t => t.status === "completed").length;
    const totalHoursAll = Array.from(hoursByUser.values()).reduce((s, h) => s + h, 0);

    return NextResponse.json({
      teams: filteredTeams,
      members: filteredMembers,
      completionTrend,
      summary: {
        totalTeams: teams.length,
        totalMembers: users.length,
        totalTasksAssigned: totalAssigned,
        totalTasksCompleted: totalCompleted,
        totalHoursLogged: Math.round(totalHoursAll * 10) / 10,
        overallCompletionRate: totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/reports/performance", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to generate performance report" }, { status: 500 });
  }
}
