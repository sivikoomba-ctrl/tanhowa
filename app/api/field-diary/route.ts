import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isAdminOrOfficial } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { awardTaskPoints } from "@/lib/task-points";
import { validate, fieldDiaryEntrySchema, fieldDiaryEntryUpdateSchema } from "@/lib/validation";
import { writeLimiter } from "@/lib/rate-limit";
import { todayIST } from "@/lib/field-diary";

const ENTRY_SELECT = "*, member:member_id(id, name, photo_url)";

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
        .range(offset, offset + limit - 1);
      return NextResponse.json({ entries: entries || [], total: count ?? 0 });
    }

    // Default: caller's own entries, newest first.
    const { data: entries, count } = await supabase
      .from("field_diary_entries")
      .select(ENTRY_SELECT, { count: "exact" })
      .eq("member_id", session.userId)
      .order("entry_date", { ascending: false })
      .range(offset, offset + limit - 1);

    return NextResponse.json({ entries: entries || [], total: count ?? 0 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch diary entries" }, { status: 500 });
  }
}

/**
 * Create or refresh today's entry — one row per member per calendar day
 * (IST), enforced by the DB unique constraint. Calling this again the same
 * day updates the existing row instead of erroring; points/contribution are
 * only awarded on first creation (awardTaskPoints is idempotent per entry id
 * too, so a genuine double-call is still safe).
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

    const supabase = getServiceClient();
    const entryDate = todayIST();

    const { data: existing } = await supabase
      .from("field_diary_entries")
      .select("id")
      .eq("member_id", session.userId)
      .eq("entry_date", entryDate)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from("field_diary_entries")
        .update({
          report_text: v.data.report_text,
          is_success_story: v.data.is_success_story ?? false,
        })
        .eq("id", existing.id)
        .select(ENTRY_SELECT)
        .single();

      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/field-diary", method: "POST", status_code: 500 });
        return NextResponse.json({ error: "Failed to save diary entry" }, { status: 500 });
      }
      return NextResponse.json({ entry: data, updated: true });
    }

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

    return NextResponse.json({ entry: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to save diary entry" }, { status: 500 });
  }
}

/** Edit an existing entry (own, or admin) — e.g. correcting a past day's entry. */
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

    return NextResponse.json({ entry: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update diary entry" }, { status: 500 });
  }
}
