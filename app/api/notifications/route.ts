import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();

    // Get user's last_active_at to determine "new since last visit"
    const { data: userData } = await supabase
      .from("users")
      .select("last_active_at")
      .eq("id", session.userId)
      .single();

    // Use last_active_at or default to 7 days ago
    const lastActive = userData?.last_active_at
      ? new Date(userData.last_active_at)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const since = lastActive.toISOString();

    // Count new items since last visit in parallel
    const [announcementsRes, pendingSubsRes, assignedTodosRes] = await Promise.all([
      // New announcements since last visit
      supabase
        .from("announcements")
        .select("id", { count: "exact", head: true })
        .eq("published", true)
        .gt("created_at", since),

      // Pending/overdue subscriptions for this user
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.userId)
        .in("status", ["pending", "overdue"]),

      // Tasks assigned to this user that need attention (pending or in_progress)
      supabase
        .from("todos")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", session.userId)
        .in("status", ["pending", "approved", "in_progress"]),
    ]);

    const newAnnouncements = announcementsRes.count || 0;
    const pendingSubs = pendingSubsRes.count || 0;
    const activeTasks = assignedTodosRes.count || 0;
    const total = newAnnouncements + pendingSubs + activeTasks;

    return NextResponse.json({
      total,
      announcements: newAnnouncements,
      subscriptions: pendingSubs,
      tasks: activeTasks,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/notifications", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
