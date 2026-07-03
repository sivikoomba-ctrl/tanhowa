import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isAdminOrOfficial } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

const BUCKET = "field-diary-media";

const MEDIA_RULES: Record<string, { types: string[]; maxSize: number; label: string }> = {
  photo: { types: ["image/jpeg", "image/png", "image/webp"], maxSize: 10 * 1024 * 1024, label: "Photo" },
  audio: { types: ["audio/mpeg", "audio/mp4", "audio/webm", "audio/ogg", "audio/wav"], maxSize: 20 * 1024 * 1024, label: "Audio" },
  // Capped at the same 50MB ceiling already proven safe through this route
  // pattern in production (see /api/project-h) — well within Vercel Pro's
  // serverless body-size limit.
  video: { types: ["video/mp4", "video/webm", "video/quicktime"], maxSize: 50 * 1024 * 1024, label: "Video" },
};

function getExtension(mimeType: string, originalName: string): string {
  const fromName = originalName.split(".").pop()?.toLowerCase();
  if (fromName) return fromName;
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/webm": "weba", "audio/ogg": "ogg", "audio/wav": "wav",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  };
  return map[mimeType] || "bin";
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const entryId = url.searchParams.get("entry_id");
    if (!entryId) return NextResponse.json({ error: "entry_id is required" }, { status: 400 });

    const supabase = getServiceClient();
    const { data: entry } = await supabase.from("field_diary_entries").select("member_id").eq("id", entryId).single();
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    if (entry.member_id !== session.userId && !(await isAdminOrOfficial(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: media, error } = await supabase
      .from("field_diary_media")
      .select("*")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: true });

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/field-diary/media", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch media" }, { status: 500 });
    }

    const enriched = await Promise.all((media || []).map(async (m) => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(m.file_path, 300);
      return { ...m, signed_url: data?.signedUrl || "" };
    }));

    return NextResponse.json({ media: enriched });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary/media", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch media" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const entryId = formData.get("entry_id") as string | null;
    const mediaType = formData.get("media_type") as string | null;

    if (!file || !entryId || !mediaType) {
      return NextResponse.json({ error: "file, entry_id and media_type are required" }, { status: 400 });
    }
    const rule = MEDIA_RULES[mediaType];
    if (!rule) return NextResponse.json({ error: "Invalid media_type" }, { status: 400 });

    const supabase = getServiceClient();
    const { data: entry } = await supabase.from("field_diary_entries").select("member_id").eq("id", entryId).single();
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    if (entry.member_id !== session.userId && !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!rule.types.includes(file.type)) {
      return NextResponse.json({ error: `${rule.label} file type not allowed` }, { status: 400 });
    }
    if (file.size > rule.maxSize) {
      return NextResponse.json({ error: `${rule.label} must be under ${Math.round(rule.maxSize / (1024 * 1024))}MB` }, { status: 400 });
    }

    const { count } = await supabase
      .from("field_diary_media")
      .select("id", { count: "exact", head: true })
      .eq("entry_id", entryId)
      .eq("media_type", mediaType);
    const caps: Record<string, number> = { photo: 6, audio: 2, video: 1 };
    if ((count || 0) >= caps[mediaType]) {
      return NextResponse.json({ error: `Maximum ${caps[mediaType]} ${rule.label.toLowerCase()} file(s) per entry` }, { status: 400 });
    }

    const ext = getExtension(file.type, file.name);
    const filePath = `${entryId}/${session.userId}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType: file.type, upsert: false });

    if (uploadError?.message?.includes("Bucket not found")) {
      await supabase.storage.createBucket(BUCKET, { public: false });
      const retry = await supabase.storage.from(BUCKET).upload(filePath, buffer, { contentType: file.type, upsert: false });
      uploadError = retry.error || null;
    }

    if (uploadError) {
      await logError({ type: "api", message: uploadError.message, path: "/api/field-diary/media", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("field_diary_media")
      .insert({
        entry_id: entryId,
        uploaded_by: session.userId,
        media_type: mediaType,
        file_path: filePath,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
      })
      .select()
      .single();

    if (error) {
      await supabase.storage.from(BUCKET).remove([filePath]).catch(() => {});
      await logError({ type: "api", message: error.message, path: "/api/field-diary/media", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to save media record" }, { status: 500 });
    }

    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 300);
    return NextResponse.json({ media: { ...data, signed_url: signed?.signedUrl || "" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary/media", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    const { data: media } = await supabase.from("field_diary_media").select("uploaded_by, file_path").eq("id", id).single();
    if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (media.uploaded_by !== session.userId && !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await supabase.storage.from(BUCKET).remove([media.file_path]).catch(() => {});
    await supabase.from("field_diary_media").delete().eq("id", id);
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary/media", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete media" }, { status: 500 });
  }
}
