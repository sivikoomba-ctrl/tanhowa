import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getOfficialInfo } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { logAudit } from "@/lib/audit-log";
import { awardTaskPoints } from "@/lib/task-points";
import { notifyNewAnnouncement } from "@/lib/mail";
import { translateContent } from "@/lib/translate-content";
import { writeLimiter } from "@/lib/rate-limit";
import { generateSuccessStoryDraft } from "@/lib/field-diary-ai";

const STORY_SELECT = "*, member:member_id(id, name, photo_url, occupation)";

async function canActOnStory(info: { role: string; official_type: string | null; district: string | null }, entryDistrict: string | null): Promise<boolean> {
  if (info.role === "super_admin" || info.official_type === "state") return true;
  if (info.official_type === "district") return !!info.district && info.district === entryDistrict;
  return false;
}

/** Admin/official review queue: drafted success stories awaiting publish/dismiss. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const info = await getOfficialInfo(session.userId);
    const isStateLevel = info.role === "super_admin" || info.official_type === "state";
    const isDistrictLevel = info.official_type === "district";
    if (!isStateLevel && !isDistrictLevel) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();
    let query = supabase
      .from("field_diary_entries")
      .select(STORY_SELECT)
      .eq("story_status", "drafted")
      .order("story_generated_at", { ascending: false });

    if (isDistrictLevel) {
      if (!info.district) {
        return NextResponse.json({ error: "Set your district in your profile to review success stories" }, { status: 403 });
      }
      query = query.eq("district", info.district);
    }

    const { data: entries, error } = await query;
    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/field-diary/stories", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch story queue" }, { status: 500 });
    }

    // Attach photos for each entry so reviewers can see what the draft was based on.
    const entryIds = (entries || []).map((e) => e.id);
    const { data: media } = entryIds.length
      ? await supabase.from("field_diary_media").select("entry_id, id, file_path, media_type").in("entry_id", entryIds).eq("media_type", "photo")
      : { data: [] };

    const photosByEntry = new Map<string, { id: string; signed_url: string }[]>();
    for (const m of media || []) {
      const { data: signed } = await supabase.storage.from("field-diary-media").createSignedUrl(m.file_path, 300);
      const list = photosByEntry.get(m.entry_id) || [];
      list.push({ id: m.id, signed_url: signed?.signedUrl || "" });
      photosByEntry.set(m.entry_id, list);
    }

    const enriched = (entries || []).map((e) => ({ ...e, photos: photosByEntry.get(e.id) || [] }));

    return NextResponse.json({ entries: enriched });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary/stories", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch story queue" }, { status: 500 });
  }
}

/** Manually (re-)trigger a draft for one entry — bypasses the auto-trigger's length/flag heuristic. */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const body = await req.json();
    const entryId = body.entry_id as string | undefined;
    if (!entryId) return NextResponse.json({ error: "entry_id is required" }, { status: 400 });

    const supabase = getServiceClient();
    const { data: entry } = await supabase.from("field_diary_entries").select("member_id, district, story_status").eq("id", entryId).single();
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const info = await getOfficialInfo(session.userId);
    const allowed = entry.member_id === session.userId || (await canActOnStory(info, entry.district));
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!["none", "dismissed"].includes(entry.story_status)) {
      return NextResponse.json({ error: `Cannot generate — story is already ${entry.story_status}` }, { status: 400 });
    }

    const { data: claimed } = await supabase
      .from("field_diary_entries")
      .update({ story_status: "queued" })
      .eq("id", entryId)
      .in("story_status", ["none", "dismissed"])
      .select("id")
      .maybeSingle();
    if (!claimed) return NextResponse.json({ error: "Already in progress" }, { status: 409 });

    generateSuccessStoryDraft(entryId).catch(() => {});
    return NextResponse.json({ message: "Draft generation started" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary/stories", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to start generation" }, { status: 500 });
  }
}

/** Admin/official review action: publish (creates an announcement) or dismiss a drafted story. */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const body = await req.json();
    const { id, action, edits, remarks } = body as {
      id?: string;
      action?: "publish" | "dismiss";
      edits?: { title?: string; body?: string };
      remarks?: string;
    };
    if (!id || !action) return NextResponse.json({ error: "id and action are required" }, { status: 400 });

    const supabase = getServiceClient();
    const { data: entry } = await supabase
      .from("field_diary_entries")
      .select("id, member_id, district, story_status, story_draft_title, story_draft_body")
      .eq("id", id)
      .single();
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (entry.story_status !== "drafted") {
      return NextResponse.json({ error: "This story is not awaiting review" }, { status: 400 });
    }

    const info = await getOfficialInfo(session.userId);
    if (!(await canActOnStory(info, entry.district))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (action === "dismiss") {
      await supabase
        .from("field_diary_entries")
        .update({
          story_status: "dismissed",
          story_reviewed_by: session.userId,
          story_reviewed_at: new Date().toISOString(),
          story_remarks: remarks || null,
        })
        .eq("id", id);
      logAudit(session.userId, "field_diary_story_dismissed", "field_diary_entries", id);
      return NextResponse.json({ message: "Dismissed" });
    }

    // action === "publish"
    const title = (edits?.title || entry.story_draft_title || "").trim();
    const content = (edits?.body || entry.story_draft_body || "").trim();
    if (!title || !content) {
      return NextResponse.json({ error: "Title and body are required to publish" }, { status: 400 });
    }

    const { data: announcement, error: annError } = await supabase
      .from("announcements")
      .insert({ title, content, author_id: session.userId, published: true })
      .select()
      .single();

    if (annError) {
      await logError({ type: "api", message: annError.message, path: "/api/field-diary/stories", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to publish announcement" }, { status: 500 });
    }

    await supabase
      .from("field_diary_entries")
      .update({
        story_status: "published",
        story_reviewed_by: session.userId,
        story_reviewed_at: new Date().toISOString(),
        published_announcement_id: announcement.id,
      })
      .eq("id", id);

    notifyNewAnnouncement(announcement.title, announcement.content);
    translateContent("announcements", announcement.id, { title: announcement.title, content: announcement.content });
    logAudit(session.userId, "field_diary_story_published", "field_diary_entries", id, { announcement_id: announcement.id });
    logContribution(session.userId, "announcement_created", "Published field diary success story: " + title);
    awardTaskPoints(entry.member_id, "diary_success_story", null, undefined, { type: "field_diary_entries", id: entry.id });
    logContribution(entry.member_id, "diary_success_story_published", "Field diary success story published: " + title);

    return NextResponse.json({ message: "Published", announcement });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary/stories", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
