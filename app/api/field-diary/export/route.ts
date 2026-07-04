// Uploads a client-generated Field Diary PDF/Word export to a public bucket
// so the QR code embedded on its cover page resolves to a real, shareable
// URL. The filename is a client-picked UUID (validated below) so the public
// URL is predictable before upload — the QR is baked into the file with that
// exact URL, then the file is uploaded to it.
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

const BUCKET = "field-diary-exports";
const MAX_BYTES = 30 * 1024 * 1024;
const FILENAME_RE = /^[a-zA-Z0-9-]+\.(pdf|docx)$/;

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const filename = formData.get("filename") as string | null;
    if (!file || !filename) {
      return NextResponse.json({ error: "file and filename are required" }, { status: 400 });
    }
    if (!FILENAME_RE.test(filename)) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = filename.endsWith(".pdf")
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    let { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, buffer, { contentType, upsert: false });

    if (uploadError?.message?.includes("Bucket not found")) {
      await supabase.storage.createBucket(BUCKET, { public: true });
      const retry = await supabase.storage.from(BUCKET).upload(filename, buffer, { contentType, upsert: false });
      uploadError = retry.error || null;
    }

    if (uploadError) {
      await logError({ type: "api", message: uploadError.message, path: "/api/field-diary/export", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    return NextResponse.json({ url: urlData.publicUrl });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary/export", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
