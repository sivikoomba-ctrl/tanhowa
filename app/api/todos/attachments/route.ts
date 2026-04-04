import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function getExtension(mimeType: string, originalName: string): string {
  const fromName = originalName.split(".").pop()?.toLowerCase();
  if (fromName) return fromName;
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "text/plain": "txt",
  };
  return map[mimeType] || "bin";
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const todoId = url.searchParams.get("todo_id");
    if (!todoId) {
      return NextResponse.json({ error: "todo_id is required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data: attachments, error } = await supabase
      .from("todo_attachments")
      .select("*, uploader:user_id(id, name, photo_url)")
      .eq("todo_id", todoId)
      .order("created_at", { ascending: true });

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos/attachments", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch attachments" }, { status: 500 });
    }

    return NextResponse.json({ attachments: attachments || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/attachments", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch attachments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const todoId = formData.get("todo_id") as string | null;

    if (!file || !todoId) {
      return NextResponse.json({ error: "File and todo_id are required" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File must be under 10MB" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const ext = getExtension(file.type, file.name);
    const fileName = `todo-${todoId}/${session.userId}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let { error: uploadError } = await supabase.storage
      .from("todo-attachments")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    // Auto-create bucket if missing
    if (uploadError?.message?.includes("Bucket not found")) {
      await supabase.storage.createBucket("todo-attachments", { public: true });
      const retry = await supabase.storage
        .from("todo-attachments")
        .upload(fileName, buffer, {
          contentType: file.type,
          upsert: true,
        });
      uploadError = retry.error;
    }

    if (uploadError) {
      await logError({ type: "api", message: uploadError.message, path: "/api/todos/attachments", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from("todo-attachments").getPublicUrl(fileName);

    // Save attachment record
    const { data, error } = await supabase
      .from("todo_attachments")
      .insert({
        todo_id: todoId,
        user_id: session.userId,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_type: ext,
      })
      .select("*, uploader:user_id(id, name, photo_url)")
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/todos/attachments", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to save attachment" }, { status: 500 });
    }

    return NextResponse.json({ attachment: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/attachments", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data: attachment } = await supabase
      .from("todo_attachments")
      .select("user_id")
      .eq("id", id)
      .single();

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    if (attachment.user_id !== session.userId && !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await supabase.from("todo_attachments").delete().eq("id", id);
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/attachments", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
  }
}
