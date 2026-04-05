import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

const SYSTEM_ADMIN_EMAIL = "tanhowa19791@gmail.com";

async function isSystemAdmin(session: { userId: string; email: string }) {
  return session.email === SYSTEM_ADMIN_EMAIL;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !(await isSystemAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("admin_documents")
      .select("*")
      .eq("created_by", session.userId)
      .order("created_at", { ascending: false });

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/admin-documents", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }

    return NextResponse.json({ documents: data || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin-documents", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isSystemAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const title = formData.get("title") as string;
    const description = (formData.get("description") as string) || "";
    const category = (formData.get("category") as string) || "General";
    const file = formData.get("file") as File | null;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Upload to Supabase Storage
    const ext = file.name.split(".").pop() || "bin";
    const fileName = `admin-docs/${session.userId}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      await logError({ type: "api", message: uploadError.message, path: "/api/admin-documents", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName);

    const { data, error } = await supabase
      .from("admin_documents")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        category,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        created_by: session.userId,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/admin-documents", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ document: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin-documents", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to upload" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isSystemAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { id, title, description, category } = body;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;

    const supabase = getServiceClient();
    const { error } = await supabase.from("admin_documents").update(updates).eq("id", id).eq("created_by", session.userId);

    if (error) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin-documents", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isSystemAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    const { error } = await supabase.from("admin_documents").delete().eq("id", id).eq("created_by", session.userId);

    if (error) {
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin-documents", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
