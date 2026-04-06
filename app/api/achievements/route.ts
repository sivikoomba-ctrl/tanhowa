import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { checkAndAwardBadges, BADGES, getBadgeById, type UserStats } from "@/lib/badges";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const me = url.searchParams.get("me");
    const leaderboard = url.searchParams.get("leaderboard");

    // --- Leaderboard mode (admin only) ---
    if (leaderboard === "true") {
      const admin = await isAdmin(session);
      if (!admin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { data: achievements, error } = await supabase
        .from("achievements")
        .select("user_id, badge, earned_at, users!achievements_user_id_fkey(name, photo_url)")
        .order("earned_at", { ascending: false });

      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/achievements", method: "GET", status_code: 500 });
        return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
      }

      // Aggregate by user
      const userMap = new Map<string, {
        userId: string;
        name: string;
        photo_url: string | null;
        badgeCount: number;
        badges: { id: string; name: string; icon: string; earned_at: string }[];
      }>();

      for (const row of achievements || []) {
        const user = row.users as unknown as { name: string; photo_url: string | null } | null;
        if (!userMap.has(row.user_id)) {
          userMap.set(row.user_id, {
            userId: row.user_id,
            name: user?.name || "Unknown",
            photo_url: user?.photo_url || null,
            badgeCount: 0,
            badges: [],
          });
        }
        const entry = userMap.get(row.user_id)!;
        const def = getBadgeById(row.badge);
        entry.badgeCount++;
        entry.badges.push({
          id: row.badge,
          name: def?.name || row.badge,
          icon: def?.icon || "",
          earned_at: row.earned_at,
        });
      }

      const leaderboardData = Array.from(userMap.values())
        .sort((a, b) => b.badgeCount - a.badgeCount)
        .slice(0, 20);

      return NextResponse.json({ leaderboard: leaderboardData });
    }

    // --- My badges mode (default or me=true) ---
    if (me === "true" || !leaderboard) {
      const userId = session.userId;

      // Fetch stats in parallel
      const [
        contribRes,
        tasksRes,
        subsRes,
        grievancesRes,
        ideasRes,
        eventsRes,
        userRes,
      ] = await Promise.all([
        // Contributions: sum minutes, count actions, distinct action types
        supabase
          .from("contributions")
          .select("action, estimated_minutes")
          .eq("user_id", userId),
        // Tasks completed
        supabase
          .from("todos")
          .select("id", { count: "exact", head: true })
          .eq("committed_by", userId)
          .eq("status", "completed"),
        // Subscriptions: paid vs total
        supabase
          .from("subscriptions")
          .select("status")
          .eq("user_id", userId),
        // Grievances/suggestions submitted
        supabase
          .from("grievances")
          .select("id", { count: "exact", head: true })
          .eq("submitted_by", userId),
        // Wishlist ideas submitted
        supabase
          .from("wishlist_ideas")
          .select("id", { count: "exact", head: true })
          .eq("submitted_by", userId),
        // Event RSVPs — count events user has RSVP'd to
        supabase
          .from("event_rsvps")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        // User record: login_count, created_at
        supabase
          .from("users")
          .select("login_count, created_at")
          .eq("id", userId)
          .single(),
      ]);

      // Build stats
      const contribData = contribRes.data || [];
      const contributionMinutes = contribData.reduce((sum: number, r: { estimated_minutes: number }) => sum + r.estimated_minutes, 0);
      const actionCount = contribData.length;
      const uniqueActionTypes = new Set(contribData.map((r: { action: string }) => r.action)).size;

      const tasksCompleted = tasksRes.count || 0;

      const subsData = subsRes.data || [];
      const totalSubscriptions = subsData.length;
      const subscriptionsPaid = subsData.filter((s: { status: string }) => s.status === "paid").length;

      const grievancesSubmitted = grievancesRes.count || 0;
      const ideasSubmitted = ideasRes.count || 0;
      const eventsRsvp = eventsRes.count || 0;

      const loginCount = userRes.data?.login_count || 0;
      const createdAt = userRes.data?.created_at ? new Date(userRes.data.created_at) : new Date();
      const daysSinceJoined = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      const stats: UserStats = {
        contributionMinutes,
        actionCount,
        uniqueActionTypes,
        tasksCompleted,
        subscriptionsPaid,
        totalSubscriptions,
        grievancesSubmitted,
        ideasSubmitted,
        eventsRsvp,
        loginCount,
        daysSinceJoined,
      };

      // Check and award new badges
      const newBadges = await checkAndAwardBadges(userId, stats);

      // Fetch all earned badges
      const { data: earned } = await supabase
        .from("achievements")
        .select("badge, earned_at")
        .eq("user_id", userId)
        .order("earned_at", { ascending: false });

      const badges = (earned || []).map((a: { badge: string; earned_at: string }) => {
        const def = getBadgeById(a.badge);
        return {
          id: a.badge,
          name: def?.name || a.badge,
          description: def?.description || "",
          icon: def?.icon || "",
          earned_at: a.earned_at,
        };
      });

      // All badge definitions for showing locked/unearned
      const allBadges = BADGES.map(b => ({
        id: b.id,
        name: b.name,
        description: b.description,
        icon: b.icon,
      }));

      return NextResponse.json({
        badges,
        stats,
        newBadges: newBadges.map(id => {
          const def = getBadgeById(id);
          return { id, name: def?.name || id, icon: def?.icon || "" };
        }),
        allBadges,
      });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/achievements", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch achievements" }, { status: 500 });
  }
}
