import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getDbRole } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { logAudit } from "@/lib/audit-log";
import { translateContent, getTranslations } from "@/lib/translate-content";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const supabase = getServiceClient();
    const dbRole = await getDbRole(session.userId);
    const isAdminUser = dbRole === "admin" || dbRole === "super_admin";

    let query = supabase
      .from("wishlist_ideas")
      .select("*, submitter:users!wishlist_ideas_submitted_by_fkey(name, photo_url)")
      .order("upvote_count", { ascending: false });

    if (!isAdminUser) {
      // Members see everything except rejected
      query = query.neq("status", "rejected");
    }

    const statusFilter = url.searchParams.get("status");
    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data: ideas } = await query;
    const items = ideas || [];

    // Get upvote status for current user
    const ideaIds = items.map((i: { id: string }) => i.id);
    const userUpvotes = new Set<string>();

    if (ideaIds.length > 0) {
      const { data: upvotes } = await supabase
        .from("wishlist_upvotes")
        .select("idea_id")
        .eq("user_id", session.userId)
        .in("idea_id", ideaIds);

      for (const u of upvotes || []) {
        userUpvotes.add(u.idea_id);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = items.map((i: any) => ({
      ...i,
      user_upvoted: userUpvotes.has(i.id),
    }));

    // Tamil translations
    const lang = url.searchParams.get("lang");
    if (lang === "ta" && enriched.length > 0) {
      const ids = enriched.map((i: { id: string }) => i.id);
      const translations = await getTranslations("wishlist_ideas", ids, "ta");
      for (const i of enriched) {
        const t = translations[i.id];
        if (t) {
          if (t.title) i.title = t.title;
          if (t.description) i.description = t.description;
        }
      }
    }

    return NextResponse.json({ ideas: enriched });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/wishlist", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch ideas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const title = (body.title || "").trim();
    const description = (body.description || "").trim();
    if (!title || !description) {
      return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("wishlist_ideas")
      .insert({
        title,
        description,
        category: (body.category || "").trim(),
        submitted_by: session.userId,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/wishlist", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to submit idea" }, { status: 500 });
    }

    logContribution(session.userId, "idea_submitted", "Submitted idea: " + title);
    logAudit(session.userId, "idea_submitted", "wishlist_idea", data.id);
    translateContent("wishlist_ideas", data.id, { title, description });

    return NextResponse.json({ idea: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/wishlist", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to submit idea" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action, id } = body;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();

    if (action === "upvote") {
      const { error } = await supabase
        .from("wishlist_upvotes")
        .insert({ idea_id: id, user_id: session.userId });

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "Already upvoted" }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to upvote" }, { status: 500 });
      }

      // Increment count
      const { data: idea } = await supabase.from("wishlist_ideas").select("upvote_count").eq("id", id).single();
      await supabase.from("wishlist_ideas").update({ upvote_count: (idea?.upvote_count || 0) + 1 }).eq("id", id);

      logContribution(session.userId, "idea_upvoted", "Upvoted an idea");
      return NextResponse.json({ message: "Upvoted" });

    } else if (action === "unvote") {
      await supabase
        .from("wishlist_upvotes")
        .delete()
        .eq("idea_id", id)
        .eq("user_id", session.userId);

      // Decrement count
      const { data: idea } = await supabase.from("wishlist_ideas").select("upvote_count").eq("id", id).single();
      await supabase.from("wishlist_ideas").update({ upvote_count: Math.max(0, (idea?.upvote_count || 1) - 1) }).eq("id", id);

      return NextResponse.json({ message: "Unvoted" });

    } else if (action === "update_status") {
      if (!(await isAdmin(session))) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.status) updates.status = body.status;
      if (body.admin_remarks !== undefined) updates.admin_remarks = body.admin_remarks;
      if (body.status === "approved") updates.approved_by = session.userId;

      await supabase.from("wishlist_ideas").update(updates).eq("id", id);
      logAudit(session.userId, "idea_status_updated", "wishlist_idea", id, { status: body.status });

      if (body.admin_remarks) {
        translateContent("wishlist_ideas", id, { admin_remarks: body.admin_remarks });
      }

      return NextResponse.json({ message: "Updated" });

    } else if (action === "convert_to_task") {
      if (!(await isAdmin(session))) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }

      // Fetch the idea
      const { data: idea } = await supabase.from("wishlist_ideas").select("*").eq("id", id).single();
      if (!idea) return NextResponse.json({ error: "Idea not found" }, { status: 404 });

      // Generate event_id
      const { data: allTasks } = await supabase
        .from("todos")
        .select("event_id")
        .like("event_id", "ET-%")
        .is("parent_id", null);

      let maxNum = 0;
      for (const t of allTasks || []) {
        const match = t.event_id?.match(/^ET-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      const eventId = `ET-${String(maxNum + 1).padStart(3, "0")}`;

      // Create the task
      const { data: task, error: taskError } = await supabase
        .from("todos")
        .insert({
          title: idea.title,
          description: idea.description + (idea.description ? "\n\n" : "") + `[From Ideas Board — ${idea.upvote_count} upvotes]`,
          submitted_by: session.userId,
          event_id: eventId,
          important: true,
          urgent: idea.upvote_count >= 10,
        })
        .select()
        .single();

      if (taskError) {
        return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
      }

      // Link task to idea and update status
      await supabase.from("wishlist_ideas").update({
        linked_task_id: task.id,
        status: "in_progress",
        updated_at: new Date().toISOString(),
      }).eq("id", id);

      logAudit(session.userId, "idea_converted_to_task", "wishlist_idea", id, { task_id: task.id, event_id: eventId });

      return NextResponse.json({ message: "Converted to task", task_id: task.id, event_id: eventId });

    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/wishlist", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
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
    await supabase.from("wishlist_ideas").delete().eq("id", id);
    logAudit(session.userId, "idea_deleted", "wishlist_idea", id);

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/wishlist", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
