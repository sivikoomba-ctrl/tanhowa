import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, SUPER_ADMIN_EMAILS } from "@/lib/auth";
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
    const [announcementsRes, pendingSubsRes, proofSubmittedSubsRes, assignedTodosRes, volunteerInviteRes] = await Promise.all([
      // New announcements since last visit
      supabase
        .from("announcements")
        .select("id", { count: "exact", head: true })
        .eq("published", true)
        .gt("created_at", since),

      // Pending/overdue subscriptions with NO proof uploaded yet (still action needed)
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.userId)
        .in("status", ["pending", "overdue"])
        .or("payment_proof_url.is.null,payment_proof_url.eq."),

      // Pending/overdue subscriptions where proof IS uploaded (awaiting admin verification)
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.userId)
        .in("status", ["pending", "overdue"])
        .gt("payment_proof_url", ""),

      // Tasks assigned to this user that need attention (pending or in_progress)
      supabase
        .from("todos")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", session.userId)
        .in("status", ["pending", "approved", "in_progress"]),

      // Pending volunteer invite for this user
      supabase
        .from("volunteer_invites")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.userId)
        .eq("status", "pending"),
    ]);

    const newAnnouncements = announcementsRes.count || 0;
    const pendingSubs = pendingSubsRes.count || 0;
    const proofSubmittedSubs = proofSubmittedSubsRes.count || 0;
    const activeTasks = assignedTodosRes.count || 0;
    const volunteerInvites = volunteerInviteRes.count || 0;

    // Draft announcements pending approval (only for super admin emails)
    let draftAnnouncements = 0;
    if (SUPER_ADMIN_EMAILS.has(session.email)) {
      const { count } = await supabase
        .from("announcements")
        .select("id", { count: "exact", head: true })
        .eq("published", false);
      draftAnnouncements = count || 0;
    }

    const total = newAnnouncements + pendingSubs + proofSubmittedSubs + activeTasks + volunteerInvites + draftAnnouncements;

    return NextResponse.json({
      total,
      announcements: newAnnouncements,
      subscriptions: pendingSubs,
      proofSubmitted: proofSubmittedSubs,
      tasks: activeTasks,
      volunteerInvites,
      draftAnnouncements,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/notifications", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
