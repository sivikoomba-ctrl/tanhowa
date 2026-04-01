import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const me = url.searchParams.get("me");
    const period = url.searchParams.get("period"); // "week", "month", "all"
    const breakdown = url.searchParams.get("breakdown");
    const admin = await isAdmin(session);

    // Date filter
    let since: string | null = null;
    if (period === "week") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      since = d.toISOString();
    } else if (period === "month") {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      since = d.toISOString();
    }

    // Breakdown mode: aggregate by action type + monthly trend (admin only)
    if (breakdown === "true") {
      if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      const { data, error } = await supabase
        .from("contributions")
        .select("action, estimated_minutes, created_at")
        .order("created_at", { ascending: true });

      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/contributions", method: "GET", status_code: 500 });
        return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
      }

      const ACTION_LABELS: Record<string, string> = {
        payment_proof_uploaded: "Uploaded payment proof",
        payment_verified: "Verified payment",
        payment_rejected: "Rejected payment",
        payment_hold: "Put payment on hold",
        member_approved: "Approved member",
        member_rejected: "Rejected member",
        announcement_created: "Created announcement",
        event_created: "Created event",
        document_uploaded: "Uploaded document",
        suggestion_submitted: "Submitted suggestion",
        grievance_submitted: "Submitted grievance",
        grievance_responded: "Responded to grievance",
        task_created: "Created task",
        task_committed: "Committed to task",
        task_updated: "Updated task",
        task_note_added: "Added task note",
        task_report_added: "Submitted task report",
        voucher_submitted: "Submitted task voucher",
        voucher_approved: "Approved voucher",
        voucher_rejected: "Rejected voucher",
        profile_updated: "Updated profile",
        expense_voucher_submitted: "Submitted expense voucher",
        member_profile_edited: "Edited member profile",
      };

      // Aggregate by action type
      const actionMap = new Map<string, { count: number; minutes: number }>();
      // Aggregate by month
      const monthMap = new Map<string, { count: number; minutes: number }>();

      for (const row of data || []) {
        // By action
        if (!actionMap.has(row.action)) actionMap.set(row.action, { count: 0, minutes: 0 });
        const a = actionMap.get(row.action)!;
        a.count++;
        a.minutes += row.estimated_minutes;

        // By month
        const d = new Date(row.created_at);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthMap.has(monthKey)) monthMap.set(monthKey, { count: 0, minutes: 0 });
        const m = monthMap.get(monthKey)!;
        m.count++;
        m.minutes += row.estimated_minutes;
      }

      const byAction = Array.from(actionMap.entries()).map(([action, stats]) => ({
        action,
        label: ACTION_LABELS[action] || action,
        count: stats.count,
        minutes: stats.minutes,
      }));

      const monthlyTrend = Array.from(monthMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, stats]) => ({ month, count: stats.count, minutes: stats.minutes }));

      return NextResponse.json({ byAction, monthlyTrend });
    }

    if (me !== "true") {
      // Admin: leaderboard — aggregate by user
      let query = supabase
        .from("contributions")
        .select("user_id, action, estimated_minutes, created_at, users!contributions_user_id_fkey(name, email, avatar_url)");

      if (since) query = query.gte("created_at", since);

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/contributions", method: "GET", status_code: 500 });
        return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
      }

      // Build leaderboard
      const userMap = new Map<string, {
        user_id: string;
        name: string;
        email: string;
        avatar_url: string | null;
        total_minutes: number;
        action_count: number;
        actions: Record<string, number>;
      }>();

      for (const row of data || []) {
        const user = row.users as unknown as { name: string; email: string; avatar_url: string | null } | null;
        if (!userMap.has(row.user_id)) {
          userMap.set(row.user_id, {
            user_id: row.user_id,
            name: user?.name || "Unknown",
            email: user?.email || "",
            avatar_url: user?.avatar_url || null,
            total_minutes: 0,
            action_count: 0,
            actions: {},
          });
        }
        const entry = userMap.get(row.user_id)!;
        entry.total_minutes += row.estimated_minutes;
        entry.action_count += 1;
        entry.actions[row.action] = (entry.actions[row.action] || 0) + 1;
      }

      const leaderboard = Array.from(userMap.values()).sort((a, b) => b.total_minutes - a.total_minutes);

      return NextResponse.json({ leaderboard, total: data?.length || 0 });
    } else {
      // Member: own contributions
      let query = supabase
        .from("contributions")
        .select("id, action, description, estimated_minutes, metadata, created_at")
        .eq("user_id", session.userId);

      if (since) query = query.gte("created_at", since);

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/contributions", method: "GET", status_code: 500 });
        return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
      }

      const totalMinutes = (data || []).reduce((sum, r) => sum + r.estimated_minutes, 0);
      return NextResponse.json({ contributions: data || [], totalMinutes });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/contributions", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch contributions" }, { status: 500 });
  }
}
