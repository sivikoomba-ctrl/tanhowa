import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getDbRole } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { notifyTaskCommitted, notifyTaskStatusChanged } from "@/lib/telegram";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const dbRole = await getDbRole(session.userId);

    const parentId = url.searchParams.get("parent_id");

    let query = supabase
      .from("todos")
      .select("*, submitter:submitted_by(id, name, photo_url, occupation), assignee:assigned_to(id, name, photo_url, occupation), committer:committed_by(id, name, photo_url)")
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    // Filter by parent: null = top-level only, specific id = children of that task
    if (parentId === "null" || parentId === null) {
      // Default: fetch only top-level tasks (no parent)
      if (!url.searchParams.has("parent_id")) {
        query = query.is("parent_id", null);
      } else {
        query = query.is("parent_id", null);
      }
    } else if (parentId) {
      query = query.eq("parent_id", parentId);
    }

    // Members see only their own submitted, assigned, or team-assigned tasks; admins see all
    if (dbRole !== "admin") {
      // Get user's team IDs
      const { data: userTeams } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", session.userId);

      const userTeamIds = (userTeams || []).map((t) => t.team_id);

      if (userTeamIds.length > 0) {
        query = query.or(
          `submitted_by.eq.${session.userId},assigned_to.eq.${session.userId},assigned_team_id.in.(${userTeamIds.join(",")})`
        );
      } else {
        query = query.or(`submitted_by.eq.${session.userId},assigned_to.eq.${session.userId}`);
      }
    }

    const { data: todos, error } = await query;

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch todos" }, { status: 500 });
    }

    // Fetch team names for todos with assigned_team_id
    const teamIds = [...new Set((todos || []).filter((t) => t.assigned_team_id).map((t) => t.assigned_team_id))];
    let teamsMap: Record<string, { id: string; name: string; icon: string }> = {};
    if (teamIds.length > 0) {
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name, icon")
        .in("id", teamIds);
      teamsMap = (teams || []).reduce((acc, t) => {
        acc[t.id] = t;
        return acc;
      }, {} as Record<string, { id: string; name: string; icon: string }>);
    }

    // Fetch subtask counts for each todo
    const todoIds = (todos || []).map((t) => t.id);
    let subtaskCounts: Record<string, number> = {};
    if (todoIds.length > 0) {
      const { data: children } = await supabase
        .from("todos")
        .select("parent_id")
        .in("parent_id", todoIds);
      subtaskCounts = (children || []).reduce((acc, c) => {
        acc[c.parent_id] = (acc[c.parent_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    }

    const todosWithTeams = (todos || []).map((t) => ({
      ...t,
      assigned_team: t.assigned_team_id ? teamsMap[t.assigned_team_id] || null : null,
      subtask_count: subtaskCounts[t.id] || 0,
    }));

    return NextResponse.json({ todos: todosWithTeams });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch todos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    if (!body.title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Generate event_id
    let eventId: string;
    if (body.parent_id) {
      // Get parent event_id and count existing siblings
      const { data: parent } = await supabase
        .from("todos")
        .select("event_id, parent_id")
        .eq("id", body.parent_id)
        .single();

      if (!parent) {
        return NextResponse.json({ error: "Parent task not found" }, { status: 404 });
      }

      // Enforce max 2 levels (sub-sub-task = level 2)
      if (parent.parent_id) {
        // Parent is already a subtask — check if grandparent also has a parent
        const { data: grandparent } = await supabase
          .from("todos")
          .select("parent_id")
          .eq("id", parent.parent_id)
          .single();
        if (grandparent?.parent_id) {
          return NextResponse.json({ error: "Maximum nesting depth is 2 levels (sub-sub-task)" }, { status: 400 });
        }
      }

      const { count } = await supabase
        .from("todos")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", body.parent_id);

      const childNum = (count || 0) + 1;
      eventId = `${parent.event_id}-${String(childNum).padStart(2, "0")}`;
    } else {
      // Top-level task: ET-001, ET-002, etc.
      const { count } = await supabase
        .from("todos")
        .select("id", { count: "exact", head: true })
        .is("parent_id", null);

      const taskNum = (count || 0) + 1;
      eventId = `ET-${String(taskNum).padStart(3, "0")}`;
    }

    const { data, error } = await supabase
      .from("todos")
      .insert({
        title: body.title,
        description: body.description || "",
        submitted_by: session.userId,
        due_date: body.due_date || null,
        parent_id: body.parent_id || null,
        event_id: eventId,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
    }

    return NextResponse.json({ todo: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const dbRole = await getDbRole(session.userId);

    // Handle commit action: member commits to a task
    if (body.action === "commit") {
      // Check if task exists and is available for commitment
      const { data: task } = await supabase
        .from("todos")
        .select("id, status, committed_by")
        .eq("id", body.id)
        .single();

      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      if (task.committed_by && task.committed_by !== session.userId) {
        return NextResponse.json({ error: "Task is already committed by another member" }, { status: 409 });
      }

      if (!["approved", "in_progress"].includes(task.status)) {
        return NextResponse.json({ error: "Only approved or in-progress tasks can be committed" }, { status: 400 });
      }

      const commitUpdates: Record<string, unknown> = {
        committed_by: session.userId,
        committed_at: new Date().toISOString(),
        status: "in_progress",
        updated_at: new Date().toISOString(),
      };
      if (body.estimated_time !== undefined) commitUpdates.estimated_time = body.estimated_time;
      if (body.estimated_amount !== undefined) commitUpdates.estimated_amount = body.estimated_amount;
      if (body.timebox_hours !== undefined) commitUpdates.timebox_hours = body.timebox_hours;

      const { error: commitError } = await supabase.from("todos").update(commitUpdates).eq("id", body.id);
      if (commitError) {
        await logError({ type: "api", message: commitError.message, path: "/api/todos", method: "PUT", status_code: 500 });
        return NextResponse.json({ error: "Failed to commit" }, { status: 500 });
      }

      // Fire-and-forget: notify task submitter & admins about commitment
      (async () => {
        try {
          const { data: taskFull } = await supabase
            .from("todos")
            .select("title, event_id, submitted_by")
            .eq("id", body.id)
            .single();
          if (!taskFull) return;

          const { data: committerUser } = await supabase
            .from("users")
            .select("name")
            .eq("id", session.userId)
            .single();
          const memberName = committerUser?.name || "A member";

          // Notify task submitter
          if (taskFull.submitted_by && taskFull.submitted_by !== session.userId) {
            const { data: submitter } = await supabase
              .from("users")
              .select("telegram_chat_id")
              .eq("id", taskFull.submitted_by)
              .single();
            if (submitter?.telegram_chat_id) {
              notifyTaskCommitted(submitter.telegram_chat_id, taskFull.title, taskFull.event_id, memberName, body.estimated_time || "", body.estimated_amount || 0, body.timebox_hours).catch(() => {});
            }
          }

          // Notify all admins
          const { data: admins } = await supabase
            .from("users")
            .select("telegram_chat_id")
            .in("role", ["admin", "super_admin"])
            .not("telegram_chat_id", "is", null);
          for (const admin of admins || []) {
            notifyTaskCommitted(admin.telegram_chat_id, taskFull.title, taskFull.event_id, memberName, body.estimated_time || "", body.estimated_amount || 0, body.timebox_hours).catch(() => {});
          }
        } catch { /* silent */ }
      })();

      return NextResponse.json({ message: "Committed" });
    }

    // Handle release commitment (admin only)
    if (body.action === "release_commitment") {
      if (dbRole !== "admin") {
        return NextResponse.json({ error: "Only admins can release commitments" }, { status: 403 });
      }
      const { error: releaseError } = await supabase.from("todos").update({
        committed_by: null,
        committed_at: null,
        estimated_time: "",
        estimated_amount: 0,
        timebox_hours: null,
        updated_at: new Date().toISOString(),
      }).eq("id", body.id);
      if (releaseError) {
        await logError({ type: "api", message: releaseError.message, path: "/api/todos", method: "PUT", status_code: 500 });
        return NextResponse.json({ error: "Failed to release" }, { status: 500 });
      }
      return NextResponse.json({ message: "Commitment released" });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (dbRole === "admin") {
      // Admin can update all fields
      if (body.status !== undefined) updates.status = body.status;
      if (body.urgent !== undefined) updates.urgent = body.urgent;
      if (body.important !== undefined) updates.important = body.important;
      if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to || null;
      if (body.assigned_team_id !== undefined) updates.assigned_team_id = body.assigned_team_id || null;
      // Clear individual assignment when team is set, and vice versa
      if (body.assigned_team_id) updates.assigned_to = null;
      if (body.assigned_to) updates.assigned_team_id = null;
      if (body.admin_remarks !== undefined) updates.admin_remarks = body.admin_remarks;
      if (body.due_date !== undefined) updates.due_date = body.due_date || null;
      if (body.timebox_hours !== undefined) updates.timebox_hours = body.timebox_hours || null;

      if (body.status === "approved" || body.status === "in_progress") {
        updates.approved_by = session.userId;
        updates.approved_at = new Date().toISOString();
      }
      if (body.status === "completed") {
        updates.completed_at = new Date().toISOString();
      }
    } else {
      // Members can only update title/description of their own pending tasks
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
      if (body.due_date !== undefined) updates.due_date = body.due_date || null;
    }

    let query = supabase.from("todos").update(updates).eq("id", body.id);

    // Non-admins can only edit their own tasks
    if (dbRole !== "admin") {
      query = query.eq("submitted_by", session.userId).eq("status", "pending");
    }

    const { error } = await query;

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
    }

    // Fire-and-forget: notify on status change
    if (body.status && dbRole === "admin") {
      (async () => {
        try {
          const { data: taskFull } = await supabase
            .from("todos")
            .select("title, event_id, submitted_by, committed_by, assigned_to")
            .eq("id", body.id)
            .single();
          if (!taskFull) return;

          // Collect unique user IDs to notify (submitter, committer, assignee)
          const notifyIds = new Set<string>();
          if (taskFull.submitted_by) notifyIds.add(taskFull.submitted_by);
          if (taskFull.committed_by) notifyIds.add(taskFull.committed_by);
          if (taskFull.assigned_to) notifyIds.add(taskFull.assigned_to);
          notifyIds.delete(session.userId); // Don't notify the admin who made the change

          if (notifyIds.size === 0) return;

          const { data: users } = await supabase
            .from("users")
            .select("telegram_chat_id")
            .in("id", Array.from(notifyIds))
            .not("telegram_chat_id", "is", null);

          for (const u of users || []) {
            notifyTaskStatusChanged(u.telegram_chat_id, taskFull.title, taskFull.event_id, body.status).catch(() => {});
          }
        } catch { /* silent */ }
      })();
    }

    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    await supabase.from("todos").delete().eq("id", id);

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
