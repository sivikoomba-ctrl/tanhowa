/**
 * TANHOWA History timeline.
 * GET — all approved members can read (supports ?lang=ta for translations).
 * POST/PUT — admin or super_admin (any admin can curate).
 * DELETE — super_admin only (irreversible, kept narrow).
 * Title + description auto-translate EN↔TA on create/update.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isSuperAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { translateContent, getTranslations } from "@/lib/translate-content";
import { logAudit } from "@/lib/audit-log";

async function canEditHistory(session: Awaited<ReturnType<typeof getSession>>) {
  return await isAdmin(session);
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("history_entries")
      .select("*")
      .order("event_date", { ascending: false })
      .order("sort_order", { ascending: true });

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/history", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }

    const items = data || [];
    const url = new URL(req.url);
    const lang = url.searchParams.get("lang");

    if (lang === "ta" && items.length > 0) {
      const ids = items.map((e: { id: string }) => e.id);
      const translations = await getTranslations("history_entries", ids, "ta");
      for (const e of items) {
        const t = translations[e.id];
        if (t) {
          if (t.title) e.title = t.title;
          if (t.description) e.description = t.description;
        }
      }
    }

    return NextResponse.json({ entries: items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/history", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!(await canEditHistory(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { event_date, title, description, image_url, sort_order } = body || {};

    if (!event_date || typeof event_date !== "string") {
      return NextResponse.json({ error: "event_date is required (YYYY-MM-DD)" }, { status: 400 });
    }
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("history_entries")
      .insert({
        event_date,
        title: title.trim(),
        description: description?.trim() || null,
        image_url: image_url || null,
        sort_order: typeof sort_order === "number" ? sort_order : 0,
        created_by: session!.userId,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/history", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create" }, { status: 500 });
    }

    translateContent("history_entries", data.id, {
      title: data.title,
      description: data.description || "",
    });

    logAudit(session!.userId, "history_create", "history_entries", data.id, { title });

    return NextResponse.json({ entry: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/history", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!(await canEditHistory(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { id, event_date, title, description, image_url, sort_order } = body || {};
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (event_date !== undefined) updates.event_date = event_date;
    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = description ? String(description).trim() : null;
    if (image_url !== undefined) updates.image_url = image_url || null;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("history_entries")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/history", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    if (title !== undefined || description !== undefined) {
      translateContent("history_entries", data.id, {
        title: data.title,
        description: data.description || "",
      });
    }

    logAudit(session!.userId, "history_update", "history_entries", id, body);

    return NextResponse.json({ entry: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/history", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!(await isSuperAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const supabase = getServiceClient();
    await supabase.from("history_entries").delete().eq("id", id);

    logAudit(session!.userId, "history_delete", "history_entries", id, {});

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/history", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
