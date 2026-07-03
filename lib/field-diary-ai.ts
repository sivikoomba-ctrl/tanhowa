// AI success-story pipeline for Field Diary — drafts a polished announcement
// from a member's diary entry (+ up to 3 photos) via Gemini, for an
// admin/official to review and optionally publish. Never auto-publishes.
import { getServiceClient } from "@/lib/supabase";
import { getGemini } from "@/lib/gemini";
import { logError } from "@/lib/error-logger";

const MAX_PHOTOS = 3;
const LENGTH_THRESHOLD = 800;
const BUCKET = "field-diary-media";

export function shouldQueueStory(entry: { is_success_story: boolean; report_text: string; story_status: string }): boolean {
  if (entry.story_status !== "none") return false;
  return entry.is_success_story || entry.report_text.length > LENGTH_THRESHOLD;
}

/**
 * Fire-and-forget: checks whether an entry qualifies for a success-story
 * draft and, if so, atomically claims it (story_status none -> queued, via
 * a conditional UPDATE that also guards against two callers racing — the
 * entry-save route and the media-upload route both call this) and kicks off
 * generation. Call after saving an entry or uploading media for it.
 */
export async function maybeQueueStory(entryId: string): Promise<void> {
  try {
    const supabase = getServiceClient();
    const { data: entry } = await supabase
      .from("field_diary_entries")
      .select("id, is_success_story, report_text, story_status")
      .eq("id", entryId)
      .single();
    if (!entry || !shouldQueueStory(entry)) return;

    const { data: claimed } = await supabase
      .from("field_diary_entries")
      .update({ story_status: "queued" })
      .eq("id", entryId)
      .eq("story_status", "none")
      .select("id")
      .maybeSingle();
    if (!claimed) return; // another caller already claimed it

    generateSuccessStoryDraft(entryId).catch(() => {});
  } catch {
    /* best-effort trigger — the cron sweep catches anything left stuck in 'queued' */
  }
}

/**
 * Generates the actual draft via Gemini. Assumes the caller has already
 * set story_status='queued' (see maybeQueueStory, or the manual /stories
 * POST route). On any failure, resets to 'none' so it can be retried
 * rather than leaving the entry stuck in 'queued'.
 */
export async function generateSuccessStoryDraft(entryId: string): Promise<void> {
  const supabase = getServiceClient();
  try {
    const { data: entry } = await supabase
      .from("field_diary_entries")
      .select("id, report_text, member:member_id(name, occupation, posting_details)")
      .eq("id", entryId)
      .single();
    if (!entry) return;

    const { data: media } = await supabase
      .from("field_diary_media")
      .select("file_path")
      .eq("entry_id", entryId)
      .eq("media_type", "photo")
      .order("created_at", { ascending: true })
      .limit(MAX_PHOTOS);

    const imageParts: { inlineData: { data: string; mimeType: string } }[] = [];
    for (const m of media || []) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(m.file_path, 120);
      if (!signed?.signedUrl) continue;
      const res = await fetch(signed.signedUrl);
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      imageParts.push({
        inlineData: { data: buffer.toString("base64"), mimeType: res.headers.get("content-type") || "image/jpeg" },
      });
    }

    const memberInfo = entry.member as unknown as { name?: string; occupation?: string; posting_details?: { regular_district?: string } } | null;
    const district = memberInfo?.posting_details?.regular_district || "";
    const whoLine = [memberInfo?.name, memberInfo?.occupation, district ? `${district} district` : ""].filter(Boolean).join(", ");

    const prompt = `You are drafting a short TANHOWA member success-story announcement from a horticultural field officer's daily diary entry.

Officer: ${whoLine || "A TANHOWA member"}

Diary entry:
"""
${entry.report_text}
"""

Write a polished, factual 150-250 word write-up in third person, suitable to publish as an official TANHOWA announcement celebrating this officer's field work. Do not invent facts not present in the diary entry above. Return ONLY a JSON object in this exact format, nothing else:
{"title": "short punchy title, under 80 characters", "body": "the write-up"}`;

    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent([...imageParts, { text: prompt }]);

    const text = result.response.text().trim();
    let jsonSource = text;
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) jsonSource = fenceMatch[1];
    const jsonMatch = jsonSource.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in Gemini response");
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.title || !parsed.body) throw new Error("Incomplete draft from Gemini");

    await supabase
      .from("field_diary_entries")
      .update({
        story_status: "drafted",
        story_draft_title: String(parsed.title).slice(0, 200),
        story_draft_body: String(parsed.body).slice(0, 5000),
        story_generated_at: new Date().toISOString(),
      })
      .eq("id", entryId);
  } catch (error) {
    try {
      await supabase.from("field_diary_entries").update({ story_status: "none" }).eq("id", entryId);
    } catch { /* ignore */ }
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: `generateSuccessStoryDraft failed: ${msg}`,
      stack: error instanceof Error ? error.stack : "",
      path: "/lib/field-diary-ai",
      method: "INTERNAL",
      status_code: 500,
    });
  }
}
