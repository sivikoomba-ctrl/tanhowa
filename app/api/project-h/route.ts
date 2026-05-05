import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isProjectHMember, isSuperAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";

const BUCKET = "project-h-documents";
const ALLOWED_CATEGORIES = [
  "Policy Drafts",
  "Position Papers",
  "Cabinet Notes",
  "Reports",
  "Correspondence",
  "Meeting Minutes",
  "Other",
];

async function canAccess(userId: string, session: { role?: string }): Promise<boolean> {
  if (session.role === "super_admin") return true;
  return await isProjectHMember(userId);
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canAccess(session.userId, session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const category = url.searchParams.get("category");

    let query = supabase
      .from("project_h_documents")
      .select("*, uploader:uploaded_by(name, email)")
      .order("created_at", { ascending: false });
    if (category && ALLOWED_CATEGORIES.includes(category)) query = query.eq("category", category);

    const { data: documents, error } = await query;
    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/project-h", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to load documents" }, { status: 500 });
    }

    // Generate short-lived signed URLs (5 min)
    const enriched = await Promise.all((documents || []).map(async (d) => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(d.file_path, 300);
      return { ...d, signed_url: data?.signedUrl || "" };
    }));

    return NextResponse.json({ documents: enriched, categories: ALLOWED_CATEGORIES });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/project-h", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load documents" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canAccess(session.userId, session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = ((formData.get("title") as string) || "").trim();
    const description = ((formData.get("description") as string) || "").trim();
    const rawCategory = (formData.get("category") as string) || "Other";
    const category = ALLOWED_CATEGORIES.includes(rawCategory) ? rawCategory : "Other";

    if (!file) return NextResponse.json({ error: "File required" }, { status: 400 });
    if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Max file size is 50MB" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${category.replace(/\s+/g, "-")}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    // Auto-create bucket on first upload (private)
    if (uploadError?.message?.includes("Bucket not found")) {
      await supabase.storage.createBucket(BUCKET, { public: false });
      const retry = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: file.type, upsert: false });
      uploadError = retry.error || null;
    }

    if (uploadError) {
      await logError({ type: "api", message: uploadError.message, path: "/api/project-h", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
    }

    const { data: doc, error: insertError } = await supabase
      .from("project_h_documents")
      .insert({
        title,
        description,
        category,
        file_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: session.userId,
      })
      .select()
      .single();

    if (insertError) {
      // Roll back the storage upload so we don't orphan a file
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      await logError({ type: "api", message: insertError.message, path: "/api/project-h", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to record document" }, { status: 500 });
    }

    logContribution(session.userId, "project_h_upload", `Uploaded "${title}" to Project H`);
    return NextResponse.json({ document: doc });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/project-h", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to upload" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canAccess(session.userId, session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.title === "string") updates.title = body.title.trim();
    if (typeof body.description === "string") updates.description = body.description.trim();
    if (typeof body.category === "string" && ALLOWED_CATEGORIES.includes(body.category)) updates.category = body.category;

    const supabase = getServiceClient();
    const { error } = await supabase.from("project_h_documents").update(updates).eq("id", body.id);
    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/project-h", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }
    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/project-h", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // DELETE is super_admin OR the original uploader (TT Team member)
    if (!(await canAccess(session.userId, session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    const { data: doc } = await supabase
      .from("project_h_documents")
      .select("file_path, uploaded_by")
      .eq("id", id)
      .single();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Only the uploader or a super_admin can delete
    if (doc.uploaded_by !== session.userId && !(await isSuperAdmin(session))) {
      return NextResponse.json({ error: "Only the uploader or a super-admin can delete" }, { status: 403 });
    }

    await supabase.storage.from(BUCKET).remove([doc.file_path]).catch(() => {});
    const { error } = await supabase.from("project_h_documents").delete().eq("id", id);
    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/project-h", method: "DELETE", status_code: 500 });
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/project-h", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
