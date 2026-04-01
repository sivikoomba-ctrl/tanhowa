import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getDbRole } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const todoId = url.searchParams.get("todo_id");
    if (!todoId) {
      return NextResponse.json({ error: "todo_id is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data: entries, error } = await supabase
      .from("todo_time_entries")
      .select("*, users:user_id(id, name)")
      .eq("todo_id", todoId)
      .order("logged_at", { ascending: false });

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos/time-entries", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch time entries" }, { status: 500 });
    }

    // Calculate totals
    const totalHours = (entries || []).reduce((sum, e) => sum + (e.hours || 0), 0);
    const contributors = new Set((entries || []).map((e) => e.user_id)).size;

    return NextResponse.json({ entries: entries || [], totalHours, contributors });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/time-entries", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch time entries" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (!body.todo_id || !body.hours || body.hours <= 0) {
      return NextResponse.json({ error: "todo_id and hours (> 0) are required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const dbRole = await getDbRole(session.userId);

    // Check task exists and is in_progress
    const { data: task } = await supabase
      .from("todos")
      .select("id, status, assigned_to, assigned_team_id, submitted_by")
      .eq("id", body.todo_id)
      .single();

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.status !== "in_progress" && dbRole !== "admin") {
      return NextResponse.json({ error: "Can only log time on in-progress tasks" }, { status: 400 });
    }

    // Check user is authorized: admin, assignee, submitter, or on the assigned team
    if (dbRole !== "admin") {
      let authorized = task.assigned_to === session.userId || task.submitted_by === session.userId;

      if (!authorized && task.assigned_team_id) {
        const { data: membership } = await supabase
          .from("team_members")
          .select("id")
          .eq("team_id", task.assigned_team_id)
          .eq("user_id", session.userId)
          .maybeSingle();
        authorized = !!membership;
      }

      if (!authorized) {
        return NextResponse.json({ error: "You are not assigned to this task" }, { status: 403 });
      }
    }

    const { data: entry, error } = await supabase
      .from("todo_time_entries")
      .insert({
        todo_id: body.todo_id,
        user_id: session.userId,
        hours: parseFloat(body.hours),
        description: body.description || "",
        logged_at: body.logged_at || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos/time-entries", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to log time" }, { status: 500 });
    }

    return NextResponse.json({ entry });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/time-entries", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to log time" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const dbRole = await getDbRole(session.userId);

    // Members can only delete their own entries
    let query = supabase.from("todo_time_entries").delete().eq("id", id);
    if (dbRole !== "admin") {
      query = query.eq("user_id", session.userId);
    }

    const { error } = await query;
    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos/time-entries", method: "DELETE", status_code: 500 });
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/time-entries", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
