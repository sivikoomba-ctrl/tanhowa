import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { notifyNewNote } from "@/lib/telegram";

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
    const { data: notes, error } = await supabase
      .from("todo_notes")
      .select("*, author:user_id(id, name, photo_url)")
      .eq("todo_id", todoId)
      .order("created_at", { ascending: true });

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos/notes", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
    }

    return NextResponse.json({ notes: notes || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/notes", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (!body.todo_id || !body.content) {
      return NextResponse.json({ error: "todo_id and content are required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("todo_notes")
      .insert({
        todo_id: body.todo_id,
        user_id: session.userId,
        content: body.content,
        type: body.type || "note",
      })
      .select("*, author:user_id(id, name, photo_url)")
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos/notes", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
    }

    // Fire-and-forget: notify task assignee/committer about new note
    (async () => {
      try {
        const { data: todo } = await supabase
          .from("todos")
          .select("title, event_id, submitted_by, committed_by, assigned_to")
          .eq("id", body.todo_id)
          .single();
        if (!todo) return;

        const { data: author } = await supabase
          .from("users")
          .select("name")
          .eq("id", session.userId)
          .single();
        const authorName = author?.name || "Someone";

        // Collect unique user IDs to notify
        const notifyIds = new Set<string>();
        if (todo.submitted_by) notifyIds.add(todo.submitted_by);
        if (todo.committed_by) notifyIds.add(todo.committed_by);
        if (todo.assigned_to) notifyIds.add(todo.assigned_to);
        notifyIds.delete(session.userId); // Don't notify the author

        if (notifyIds.size === 0) return;

        const { data: users } = await supabase
          .from("users")
          .select("telegram_chat_id")
          .in("id", Array.from(notifyIds))
          .not("telegram_chat_id", "is", null);

        for (const u of users || []) {
          notifyNewNote(u.telegram_chat_id, todo.title, todo.event_id, body.type || "note", authorName, body.content).catch(() => {});
        }
      } catch { /* silent */ }
    })();

    return NextResponse.json({ note: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/notes", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
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
    // Users can delete their own notes, admins can delete any
    const { data: note } = await supabase
      .from("todo_notes")
      .select("user_id")
      .eq("id", id)
      .single();

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    if (note.user_id !== session.userId && session.role !== "admin" && session.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await supabase.from("todo_notes").delete().eq("id", id);
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/notes", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
