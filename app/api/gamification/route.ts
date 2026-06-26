import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { fetchAllRows } from "@/lib/supabase-helpers";
import { getLevel } from "@/lib/task-points";

type PointRow = { user_id: string; points: number; reason: string; created_at: string };

const EXEMPT = ["tanhowa19791@gmail.com", "tanhowaadmin@tanhowa.in"];

/**
 * GET /api/gamification — task-points progress for the current member plus a
 * leaderboard. ?period=week|month|all (leaderboard window), ?scope=overall|district.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "all";
    const scope = url.searchParams.get("scope") || "overall";

    const supabase = getServiceClient();

    const [rows, users] = await Promise.all([
      fetchAllRows<PointRow>((from, to) =>
        supabase.from("task_points").select("user_id, points, reason, created_at").range(from, to),
      ),
      fetchAllRows<{ id: string; name: string | null; email: string; posting_details: Record<string, string> | null }>((from, to) =>
        supabase.from("users").select("id, name, email, posting_details").eq("status", "approved").range(from, to),
      ),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const myDistrict = (userMap.get(session.userId)?.posting_details?.regular_district) || "";

    // Period cutoff for the leaderboard
    const now = Date.now();
    const cutoff = period === "week" ? now - 7 * 864e5 : period === "month" ? now - 30 * 864e5 : 0;

    // All-time totals per user (level is lifetime) + period totals for the board
    const lifetime = new Map<string, number>();
    const periodPts = new Map<string, number>();
    const myBreakdown: Record<string, number> = {};
    const myRecent: { points: number; reason: string; created_at: string }[] = [];
    const myWeeks = new Set<number>();

    for (const r of rows) {
      lifetime.set(r.user_id, (lifetime.get(r.user_id) || 0) + r.points);
      const ts = new Date(r.created_at).getTime();
      if (!cutoff || ts >= cutoff) periodPts.set(r.user_id, (periodPts.get(r.user_id) || 0) + r.points);
      if (r.user_id === session.userId) {
        myBreakdown[r.reason] = (myBreakdown[r.reason] || 0) + r.points;
        myRecent.push({ points: r.points, reason: r.reason, created_at: r.created_at });
        myWeeks.add(Math.floor((now - ts) / (7 * 864e5)));
      }
    }

    // Streak: consecutive 7-day windows ending today that contain at least one award
    let streak = 0;
    while (myWeeks.has(streak)) streak++;

    const myPoints = lifetime.get(session.userId) || 0;

    // Build leaderboard (exclude test accounts; scope to district if requested)
    const board = Array.from(periodPts.entries())
      .map(([uid, pts]) => {
        const u = userMap.get(uid);
        return {
          userId: uid,
          name: u?.name || "Member",
          email: u?.email || "",
          district: u?.posting_details?.regular_district || "",
          points: pts,
          level: getLevel(lifetime.get(uid) || 0),
        };
      })
      .filter((e) => e.userId && !EXEMPT.includes(e.email))
      .filter((e) => scope !== "district" || e.district === myDistrict)
      .sort((a, b) => b.points - a.points);

    const myRank = board.findIndex((e) => e.userId === session.userId) + 1;

    myRecent.sort((a, b) => b.created_at.localeCompare(a.created_at));

    return NextResponse.json({
      me: {
        points: myPoints,
        level: getLevel(myPoints),
        rank: myRank || null,
        streak,
        breakdown: myBreakdown,
        recent: myRecent.slice(0, 10),
      },
      leaderboard: board.slice(0, 25).map((e, i) => ({
        rank: i + 1,
        name: e.name,
        district: e.district,
        points: e.points,
        level: { name: e.level.name, emoji: e.level.emoji },
        isMe: e.userId === session.userId,
      })),
      period,
      scope,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/gamification", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
