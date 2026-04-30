import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

// Returns the user's top 3 active tasks for the dashboard "Today's Focus" card.
// Sorted by Eisenhower quadrant (Do First > Schedule > Delegate > Eliminate),
// then in_progress before approved (finish what you started), then due_date asc.

interface TodoRow {
  id: string;
  event_id: string;
  title: string;
  status: string;
  urgent: boolean;
  important: boolean;
  due_date: string | null;
  committed_by: string | null;
  assigned_to: string | null;
  assigned_team_id: string | null;
  timebox_hours: number | null;
}

function quadrantScore(urgent: boolean, important: boolean): number {
  if (urgent && important) return 4;
  if (!urgent && important) return 3;
  if (urgent && !important) return 2;
  return 1;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "3", 10) || 3, 1), 10);

    // User's teams
    const { data: userTeams } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", session.userId);
    const teamIds = (userTeams || []).map((t) => t.team_id);

    let query = supabase
      .from("todos")
      .select("id, event_id, title, status, urgent, important, due_date, committed_by, assigned_to, assigned_team_id, timebox_hours")
      .in("status", ["approved", "in_progress"])
      .is("parent_id", null);

    if (teamIds.length > 0) {
      query = query.or(
        `assigned_to.eq.${session.userId},committed_by.eq.${session.userId},assigned_team_id.in.(${teamIds.join(",")})`
      );
    } else {
      query = query.or(`assigned_to.eq.${session.userId},committed_by.eq.${session.userId}`);
    }

    const { data: todos, error } = await query;

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos/today", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
    }

    const farFuture = Number.MAX_SAFE_INTEGER;
    const sorted = (todos || [])
      .map((t: TodoRow) => ({
        ...t,
        committedByMe: t.committed_by === session.userId,
      }))
      .sort((a, b) => {
        // 1) Higher quadrant score first
        const sb = quadrantScore(b.urgent, b.important) - quadrantScore(a.urgent, a.important);
        if (sb !== 0) return sb;
        // 2) in_progress before approved (finish what you started)
        const ap = a.status === "in_progress" ? 0 : 1;
        const bp = b.status === "in_progress" ? 0 : 1;
        if (ap !== bp) return ap - bp;
        // 3) Earliest due date first (nulls last)
        const at = a.due_date ? new Date(a.due_date).getTime() : farFuture;
        const bt = b.due_date ? new Date(b.due_date).getTime() : farFuture;
        return at - bt;
      })
      .slice(0, limit);

    return NextResponse.json({ todos: sorted });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/today", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}
