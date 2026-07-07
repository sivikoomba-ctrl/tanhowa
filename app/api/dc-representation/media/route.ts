import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getOfficialInfo } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

const BUCKET = "dc-representation-media";

const MEDIA_RULES: Record<string, { types: string[]; extensions: string[]; maxSize: number; label: string; cap: number }> = {
  letter: { types: ["image/jpeg", "image/png", "image/webp", "application/pdf"], extensions: ["jpg", "jpeg", "png", "webp", "pdf"], maxSize: 10 * 1024 * 1024, label: "Letter", cap: 1 },
  photo: { types: ["image/jpeg", "image/png", "image/webp"], extensions: ["jpg", "jpeg", "png", "webp"], maxSize: 10 * 1024 * 1024, label: "Photo", cap: 6 },
};

function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}

function isAllowedMedia(rule: { types: string[]; extensions: string[] }, mimeType: string, fileName: string): boolean {
  const base = baseMimeType(mimeType);
  if (rule.types.includes(base)) return true;
  const ext = fileName.split(".").pop()?.toLowerCase();
  if ((!base || base === "application/octet-stream") && ext && rule.extensions.includes(ext)) return true;
  return false;
}

function getExtension(mimeType: string, originalName: string): string {
  const fromName = originalName.split(".").pop()?.toLowerCase();
  if (fromName) return fromName;
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
  };
  return map[baseMimeType(mimeType)] || "bin";
}

async function canActOnEntry(
  supabase: ReturnType<typeof getServiceClient>,
  session: { userId: string },
  entryId: string
): Promise<{ ok: boolean; district?: string }> {
  const { data: entry } = await supabase.from("dc_representation").select("district").eq("id", entryId).single();
  if (!entry) return { ok: false };
  const info = await getOfficialInfo(session.userId);
  if (info.official_type === "district") {
    return { ok: info.district === entry.district, district: entry.district };
  }
  const isAdminRole = info.role === "admin" || info.role === "super_admin";
  return { ok: isAdminRole, district: entry.district };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const entryId = url.searchParams.get("entry_id");
    if (!entryId) return NextResponse.json({ error: "entry_id is required" }, { status: 400 });

    const supabase = getServiceClient();
    const { ok } = await canActOnEntry(supabase, session, entryId);
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: media, error } = await supabase
      .from("dc_representation_media")
      .select("*")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: true });

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/dc-representation/media", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch media" }, { status: 500 });
    }

    const enriched = await Promise.all((media || []).map(async (m) => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(m.file_path, 300);
      return { ...m, signed_url: data?.signedUrl || "" };
    }));

    return NextResponse.json({ media: enriched });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/dc-representation/media", method: "GET", status_code: 500 });
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
    const { ok } = await canActOnEntry(supabase, session, entryId);
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!isAllowedMedia(rule, file.type, file.name)) {
      return NextResponse.json({ error: `${rule.label} file type not allowed (${file.type || "unknown"})` }, { status: 400 });
    }
    if (file.size > rule.maxSize) {
      return NextResponse.json({ error: `${rule.label} must be under ${Math.round(rule.maxSize / (1024 * 1024))}MB` }, { status: 400 });
    }

    const { count } = await supabase
      .from("dc_representation_media")
      .select("id", { count: "exact", head: true })
      .eq("entry_id", entryId)
      .eq("media_type", mediaType);
    if ((count || 0) >= rule.cap) {
      return NextResponse.json({ error: `Maximum ${rule.cap} ${rule.label.toLowerCase()}(s) per entry` }, { status: 400 });
    }

    const ext = getExtension(file.type, file.name);
    const filePath = `${entryId}/${mediaType}-${session.userId}-${Date.now()}.${ext}`;
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
      await logError({ type: "api", message: uploadError.message, path: "/api/dc-representation/media", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("dc_representation_media")
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
      await logError({ type: "api", message: error.message, path: "/api/dc-representation/media", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to save media record" }, { status: 500 });
    }

    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 300);
    return NextResponse.json({ media: { ...data, signed_url: signed?.signedUrl || "" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/dc-representation/media", method: "POST", status_code: 500 });
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
    const { data: media } = await supabase.from("dc_representation_media").select("entry_id, file_path, uploaded_by").eq("id", id).single();
    if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { ok } = await canActOnEntry(supabase, session, media.entry_id);
    if (!ok && media.uploaded_by !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await supabase.storage.from(BUCKET).remove([media.file_path]).catch(() => {});
    await supabase.from("dc_representation_media").delete().eq("id", id);
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/dc-representation/media", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete media" }, { status: 500 });
  }
}
