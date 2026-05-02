import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.email !== "tanhowa19791@gmail.com") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Calculate 6 months ago for trend
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

    // Fetch all data in parallel
    const [usersRes, contribRes, recentContribRes] = await Promise.all([
      supabase.from("users").select("id, name, email, last_active_at, login_count, status, created_at")
        .eq("status", "approved")
        .neq("email", "tanhowa19791@gmail.com")
        .neq("email", "tanhowaadmin@tanhowa.in"),
      supabase.from("contributions").select("user_id, action, estimated_minutes, created_at")
        .gte("created_at", sixMonthsAgo),
      supabase.from("contributions").select("user_id, action, estimated_minutes, created_at")
        .gte("created_at", thirtyDaysAgo),
    ]);

    const users = usersRes.data || [];
    const allContribs = contribRes.data || [];
    const recentContribs = recentContribRes.data || [];

    // --- Login frequency (DAU, WAU, MAU) ---
    let dau = 0, wau = 0, mau = 0;
    for (const u of users) {
      if (!u.last_active_at) continue;
      const la = new Date(u.last_active_at);
      if (la >= new Date(oneDayAgo)) dau++;
      if (la >= new Date(sevenDaysAgo)) wau++;
      if (la >= new Date(thirtyDaysAgo)) mau++;
    }

    // --- Feature adoption (last 30 days) ---
    const featureMap = new Map<string, { users: Set<string>; count: number; minutes: number }>();
    for (const c of recentContribs) {
      if (!featureMap.has(c.action)) {
        featureMap.set(c.action, { users: new Set(), count: 0, minutes: 0 });
      }
      const f = featureMap.get(c.action)!;
      f.users.add(c.user_id);
      f.count++;
      f.minutes += c.estimated_minutes || 0;
    }

    const featureAdoption = Array.from(featureMap.entries())
      .map(([action, data]) => ({
        action,
        uniqueUsers: data.users.size,
        totalUses: data.count,
        totalMinutes: data.minutes,
      }))
      .sort((a, b) => b.totalUses - a.totalUses);

    // Top 10 features
    const topFeatures = featureAdoption.slice(0, 10);

    // --- Inactive members (no activity in 30 days or never active) ---
    const inactiveMembers = users
      .filter(u => !u.last_active_at || new Date(u.last_active_at) < new Date(thirtyDaysAgo))
      .map(u => ({
        id: u.id,
        name: u.name || "",
        email: u.email,
        lastActive: u.last_active_at || null,
        loginCount: u.login_count || 0,
        daysInactive: u.last_active_at
          ? Math.floor((now.getTime() - new Date(u.last_active_at).getTime()) / (24 * 60 * 60 * 1000))
          : null,
      }))
      .sort((a, b) => {
        if (a.daysInactive === null) return 1;
        if (b.daysInactive === null) return -1;
        return b.daysInactive - a.daysInactive;
      });

    // --- Churn risk (were active but stopped - login_count > 5, inactive > 14 days) ---
    const churnRisk = users
      .filter(u => (u.login_count || 0) > 5 && u.last_active_at && new Date(u.last_active_at) < new Date(fourteenDaysAgo))
      .map(u => ({
        id: u.id,
        name: u.name || "",
        email: u.email,
        lastActive: u.last_active_at,
        loginCount: u.login_count || 0,
        daysInactive: Math.floor((now.getTime() - new Date(u.last_active_at!).getTime()) / (24 * 60 * 60 * 1000)),
      }))
      .sort((a, b) => b.daysInactive - a.daysInactive);

    // --- Engagement trend (monthly active users for last 6 months) ---
    const monthlyActive = new Map<string, Set<string>>();
    for (const c of allContribs) {
      const month = c.created_at?.slice(0, 7); // "2026-01"
      if (!month) continue;
      if (!monthlyActive.has(month)) monthlyActive.set(month, new Set());
      monthlyActive.get(month)!.add(c.user_id);
    }

    const engagementTrend = Array.from(monthlyActive.entries())
      .map(([month, userSet]) => ({
        month,
        activeUsers: userSet.size,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return NextResponse.json({
      loginFrequency: { dau, wau, mau },
      featureAdoption,
      topFeatures,
      inactiveMembers,
      inactiveCount: inactiveMembers.length,
      churnRisk,
      engagementTrend,
      totalMembers: users.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/reports/engagement", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to generate engagement report" }, { status: 500 });
  }
}
