import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isSuperAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isSuperAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const type = url.searchParams.get("type"); // internal, assigned, checklist
    const status = url.searchParams.get("status");

    const supabase = getServiceClient();
    let query = supabase
      .from("admin_tasks")
      .select("*, assigned_user:users!admin_tasks_assigned_to_fkey(name), assigned_team:teams!admin_tasks_assigned_team_id_fkey(name)")
      .order("created_at", { ascending: false });

    if (type) query = query.eq("type", type);
    if (status && status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/admin-tasks", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
    }

    return NextResponse.json({ tasks: data || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin-tasks", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isSuperAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { title, description, type, priority, assigned_to, assigned_team_id, due_date } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const validTypes = ["internal", "assigned", "checklist"];
    if (type && !validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("admin_tasks")
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        type: type || "internal",
        priority: priority || "medium",
        assigned_to: assigned_to || null,
        assigned_team_id: assigned_team_id || null,
        due_date: due_date || null,
        created_by: session.userId,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/admin-tasks", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
    }

    return NextResponse.json({ task: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin-tasks", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isSuperAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Task ID required" }, { status: 400 });
    }

    const allowedFields: Record<string, unknown> = {};
    if (updates.title !== undefined) allowedFields.title = updates.title;
    if (updates.description !== undefined) allowedFields.description = updates.description;
    if (updates.status !== undefined) {
      allowedFields.status = updates.status;
      if (updates.status === "completed") allowedFields.completed_at = new Date().toISOString();
      if (updates.status === "pending" || updates.status === "in_progress") allowedFields.completed_at = null;
    }
    if (updates.priority !== undefined) allowedFields.priority = updates.priority;
    if (updates.assigned_to !== undefined) allowedFields.assigned_to = updates.assigned_to;
    if (updates.assigned_team_id !== undefined) allowedFields.assigned_team_id = updates.assigned_team_id;
    if (updates.due_date !== undefined) allowedFields.due_date = updates.due_date;
    if (updates.remarks !== undefined) allowedFields.remarks = updates.remarks;

    allowedFields.updated_at = new Date().toISOString();

    const supabase = getServiceClient();
    const { error } = await supabase.from("admin_tasks").update(allowedFields).eq("id", id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/admin-tasks", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin-tasks", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isSuperAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    const { error } = await supabase.from("admin_tasks").delete().eq("id", id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/admin-tasks", method: "DELETE", status_code: 500 });
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin-tasks", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
