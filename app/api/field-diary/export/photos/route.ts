// Fetches Field Diary photo bytes server-side and returns them as data URIs
// so the client-side PDF/Word export never has to load a Supabase signed URL
// through an <img crossOrigin="anonymous"> + canvas (which silently produces
// nothing if the storage response doesn't carry CORS headers the browser
// will accept for pixel access — the root cause of "no photos in the
// export"). A plain server-to-server fetch has no CORS concept at all.
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdminOrOfficial } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

const BUCKET = "field-diary-media";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const mediaIds = Array.isArray(body?.media_ids) ? body.media_ids.filter((id: unknown) => typeof id === "string") : [];
    if (mediaIds.length === 0) return NextResponse.json({ photos: {} });

    const supabase = getServiceClient();
    const { data: media } = await supabase
      .from("field_diary_media")
      .select("id, file_path, mime_type, entry:entry_id(member_id)")
      .in("id", mediaIds)
      .eq("media_type", "photo");

    const isPrivileged = await isAdminOrOfficial(session);
    const photos: Record<string, { dataUrl: string; mimeType: string }> = {};

    await Promise.all(
      (media || []).map(async (m) => {
        const owner = (m.entry as unknown as { member_id: string } | null)?.member_id;
        if (owner !== session.userId && !isPrivileged) return; // skip media that isn't the caller's own (or admin/official)

        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(m.file_path, 120);
        if (!signed?.signedUrl) return;
        const res = await fetch(signed.signedUrl);
        if (!res.ok) return;
        const buffer = Buffer.from(await res.arrayBuffer());
        const mimeType = m.mime_type || res.headers.get("content-type") || "image/jpeg";
        photos[m.id] = { dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`, mimeType };
      })
    );

    return NextResponse.json({ photos });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary/export/photos", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch photos" }, { status: 500 });
  }
}
