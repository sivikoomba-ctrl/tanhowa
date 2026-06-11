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
    const [{ data: folders, error }, { data: docs }] = await Promise.all([
      supabase.from("admin_document_folders").select("*").eq("created_by", session.userId).order("name"),
      supabase.from("admin_documents").select("folder_id").eq("created_by", session.userId),
    ]);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/admin-documents/folders", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }

    const counts = new Map<string, number>();
    for (const d of docs || []) {
      if (d.folder_id) counts.set(d.folder_id, (counts.get(d.folder_id) || 0) + 1);
    }

    return NextResponse.json({
      folders: (folders || []).map((f) => ({ ...f, doc_count: counts.get(f.id) || 0 })),
      unfiled_count: (docs || []).filter((d) => !d.folder_id).length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin-documents/folders", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isSystemAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Folder name is required" }, { status: 400 });

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("admin_document_folders")
      .insert({ name: name.trim(), created_by: session.userId })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A folder with this name already exists" }, { status: 409 });
      }
      await logError({ type: "api", message: error.message, path: "/api/admin-documents/folders", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
    }

    return NextResponse.json({ folder: { ...data, doc_count: 0 } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin-documents/folders", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isSystemAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, name } = await req.json();
    if (!id || !name?.trim()) return NextResponse.json({ error: "ID and name are required" }, { status: 400 });

    const supabase = getServiceClient();
    const { error } = await supabase
      .from("admin_document_folders")
      .update({ name: name.trim() })
      .eq("id", id)
      .eq("created_by", session.userId);

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A folder with this name already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: "Rename failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin-documents/folders", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Rename failed" }, { status: 500 });
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

    // folder_id FK is ON DELETE SET NULL — documents become Unfiled
    const supabase = getServiceClient();
    const { error } = await supabase
      .from("admin_document_folders")
      .delete()
      .eq("id", id)
      .eq("created_by", session.userId);

    if (error) {
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin-documents/folders", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
