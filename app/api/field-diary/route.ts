import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isAdminOrOfficial } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { awardTaskPoints } from "@/lib/task-points";
import { validate, fieldDiaryEntrySchema, fieldDiaryEntryUpdateSchema } from "@/lib/validation";
import { writeLimiter } from "@/lib/rate-limit";
import { todayIST, isValidBackfillDate, BACKFILL_WINDOW_DAYS } from "@/lib/field-diary";
import { maybeQueueStory } from "@/lib/field-diary-ai";

const ENTRY_SELECT = "*, member:member_id(id, name, photo_url)";
const MEDIA_BUCKET = "field-diary-media";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const memberId = url.searchParams.get("member_id");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "30"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    if (id) {
      const { data: entry } = await supabase.from("field_diary_entries").select(ENTRY_SELECT).eq("id", id).single();
      if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (entry.member_id !== session.userId && !(await isAdminOrOfficial(session))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json({ entry });
    }

    // A specific member's entries — admin/official drill-down only.
    if (memberId && memberId !== session.userId) {
      if (!(await isAdminOrOfficial(session))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const { data: entries, count } = await supabase
        .from("field_diary_entries")
        .select(ENTRY_SELECT, { count: "exact" })
        .eq("member_id", memberId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      return NextResponse.json({ entries: entries || [], total: count ?? 0 });
    }

    // Default: caller's own entries, newest first (a day can have several entries).
    const { data: entries, count } = await supabase
      .from("field_diary_entries")
      .select(ENTRY_SELECT, { count: "exact" })
      .eq("member_id", session.userId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    return NextResponse.json({ entries: entries || [], total: count ?? 0 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch diary entries" }, { status: 500 });
  }
}

/**
 * Create a new entry for today (or, with entry_date, a backfilled recent past
 * day). Members can log more than one entry per day (e.g. a morning visit and
 * an afternoon visit) — every call inserts a fresh row.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const body = await req.json();
    const v = validate(fieldDiaryEntrySchema, body);
    if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 });

    // A backfill date must fall within the allowed past window; today always
    // uses the server-computed IST date, never a client-supplied one.
    let entryDate = todayIST();
    if (v.data.entry_date) {
      if (!isValidBackfillDate(v.data.entry_date)) {
        return NextResponse.json({ error: `entry_date must be within the last ${BACKFILL_WINDOW_DAYS} days (not today)` }, { status: 400 });
      }
      entryDate = v.data.entry_date;
    }

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("field_diary_entries")
      .insert({
        member_id: session.userId,
        entry_date: entryDate,
        report_text: v.data.report_text,
        is_success_story: v.data.is_success_story ?? false,
      })
      .select(ENTRY_SELECT)
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/field-diary", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to save diary entry" }, { status: 500 });
    }

    awardTaskPoints(session.userId, "diary_entry", null, undefined, { type: "field_diary_entries", id: data.id });
    logContribution(session.userId, "diary_entry_submitted", "Submitted field diary entry");
    maybeQueueStory(data.id).catch(() => {});

    return NextResponse.json({ entry: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to save diary entry" }, { status: 500 });
  }
}

/** Edit an existing entry (own, or admin) — e.g. correcting an earlier entry's text. */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const body = await req.json();
    const v = validate(fieldDiaryEntryUpdateSchema, body);
    if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 });

    const supabase = getServiceClient();
    const { data: target } = await supabase.from("field_diary_entries").select("member_id").eq("id", v.data.id).single();
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (target.member_id !== session.userId && !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updates: Record<string, string | boolean> = {};
    if (v.data.report_text !== undefined) updates.report_text = v.data.report_text;
    if (v.data.is_success_story !== undefined) updates.is_success_story = v.data.is_success_story;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("field_diary_entries")
      .update(updates)
      .eq("id", v.data.id)
      .select(ENTRY_SELECT)
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/field-diary", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update diary entry" }, { status: 500 });
    }

    maybeQueueStory(v.data.id).catch(() => {});
    return NextResponse.json({ entry: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update diary entry" }, { status: 500 });
  }
}

/** Delete an entry (own, or admin) — also removes its media rows and storage objects. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    const { data: entry } = await supabase.from("field_diary_entries").select("member_id").eq("id", id).single();
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (entry.member_id !== session.userId && !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: media } = await supabase.from("field_diary_media").select("file_path").eq("entry_id", id);
    const paths = (media || []).map((m) => m.file_path);
    if (paths.length > 0) {
      await supabase.storage.from(MEDIA_BUCKET).remove(paths).catch(() => {});
    }

    const { error } = await supabase.from("field_diary_entries").delete().eq("id", id);
    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/field-diary", method: "DELETE", status_code: 500 });
      return NextResponse.json({ error: "Failed to delete diary entry" }, { status: 500 });
    }

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete diary entry" }, { status: 500 });
  }
}
