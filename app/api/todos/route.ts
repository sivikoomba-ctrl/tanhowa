import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getDbRole } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

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

    let query = supabase
      .from("todos")
      .select("*, submitter:submitted_by(id, name, photo_url, occupation), assignee:assigned_to(id, name, photo_url, occupation)")
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    // Members see only their own submitted or assigned tasks; admins see all
    if (dbRole !== "admin") {
      query = query.or(`submitted_by.eq.${session.userId},assigned_to.eq.${session.userId}`);
    }

    const { data: todos, error } = await query;

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch todos" }, { status: 500 });
    }

    return NextResponse.json({ todos: todos || [] });
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

    const { data, error } = await supabase
      .from("todos")
      .insert({
        title: body.title,
        description: body.description || "",
        submitted_by: session.userId,
        due_date: body.due_date || null,
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

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (dbRole === "admin") {
      // Admin can update all fields
      if (body.status !== undefined) updates.status = body.status;
      if (body.urgent !== undefined) updates.urgent = body.urgent;
      if (body.important !== undefined) updates.important = body.important;
      if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to || null;
      if (body.admin_remarks !== undefined) updates.admin_remarks = body.admin_remarks;
      if (body.due_date !== undefined) updates.due_date = body.due_date || null;

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
