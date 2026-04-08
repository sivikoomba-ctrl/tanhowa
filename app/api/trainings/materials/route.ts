import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isAdminOrOfficial } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg", "image/png", "image/webp",
  "text/plain",
  "video/mp4", "video/webm",
];

const MAX_SIZE = 50 * 1024 * 1024; // 50MB for training materials (videos)

function getExtension(mimeType: string, originalName: string): string {
  const fromName = originalName.split(".").pop()?.toLowerCase();
  if (fromName) return fromName;
  const map: Record<string, string> = {
    "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png",
    "video/mp4": "mp4", "video/webm": "webm", "text/plain": "txt",
  };
  return map[mimeType] || "bin";
}

/**
 * GET /api/trainings/materials?training_id=xxx
 * Returns materials filtered by access control.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const trainingId = url.searchParams.get("training_id");
    if (!trainingId) return NextResponse.json({ error: "training_id required" }, { status: 400 });

    const supabase = getServiceClient();
    const admin = await isAdmin(session);

    // Fetch all materials for this training
    const { data: materials } = await supabase
      .from("training_materials")
      .select("*, uploader:uploaded_by(name)")
      .eq("training_id", trainingId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!materials || materials.length === 0) {
      return NextResponse.json({ materials: [] });
    }

    // Admin sees everything
    if (admin) {
      // Generate signed URLs for private bucket files
      const enriched = await Promise.all(materials.map(async (m) => {
        if (m.file_url && !m.file_url.startsWith("http")) {
          const { data } = await supabase.storage.from("training-materials").createSignedUrl(m.file_url, 300);
          return { ...m, signed_url: data?.signedUrl || "" };
        }
        return { ...m, signed_url: m.file_url };
      }));
      return NextResponse.json({ materials: enriched });
    }

    // Check enrollment
    const { data: enrollment } = await supabase
      .from("training_enrollments")
      .select("status")
      .eq("training_id", trainingId)
      .eq("user_id", session.userId)
      .maybeSingle();

    const isEnrolled = enrollment && enrollment.status !== "cancelled";

    // Check selected access
    const materialIds = materials.map((m) => m.id);
    const { data: accessRows } = await supabase
      .from("training_material_access")
      .select("material_id")
      .in("material_id", materialIds)
      .eq("user_id", session.userId);

    const accessibleIds = new Set((accessRows || []).map((a) => a.material_id));

    // Filter by access
    const filtered = materials.filter((m) => {
      if (m.access === "all") return true;
      if (m.access === "enrolled" && isEnrolled) return true;
      if (m.access === "selected" && accessibleIds.has(m.id)) return true;
      return false;
    });

    // Generate signed URLs
    const enriched = await Promise.all(filtered.map(async (m) => {
      if (m.file_url && !m.file_url.startsWith("http")) {
        const { data } = await supabase.storage.from("training-materials").createSignedUrl(m.file_url, 300);
        return { ...m, signed_url: data?.signedUrl || "" };
      }
      return { ...m, signed_url: m.file_url };
    }));

    return NextResponse.json({ materials: enriched });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/trainings/materials", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch materials" }, { status: 500 });
  }
}

/**
 * POST /api/trainings/materials
 * Upload a training material file.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdminOrOfficial(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const trainingId = formData.get("training_id") as string;
    const title = formData.get("title") as string;
    const language = (formData.get("language") as string) || "en";
    const access = (formData.get("access") as string) || "enrolled";
    const groupId = formData.get("group_id") as string | null;
    const description = (formData.get("description") as string) || "";

    if (!file || !trainingId || !title?.trim()) {
      return NextResponse.json({ error: "File, training_id, and title required" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File must be under 50MB" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const ext = getExtension(file.type, file.name);
    const storagePath = `${trainingId}/${language}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("training-materials")
      .upload(storagePath, buffer, { contentType: file.type, upsert: true });

    if (uploadError) {
      await logError({ type: "api", message: uploadError.message, path: "/api/trainings/materials", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("training_materials")
      .insert({
        training_id: trainingId,
        title: title.trim(),
        description,
        file_url: storagePath,
        file_name: file.name,
        file_type: ext,
        file_size: file.size,
        language,
        group_id: groupId || null,
        access,
        uploaded_by: session.userId,
      })
      .select("id")
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/trainings/materials", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to save material" }, { status: 500 });
    }

    return NextResponse.json({ message: "Material uploaded", id: data.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/trainings/materials", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to upload" }, { status: 500 });
  }
}

/**
 * PUT /api/trainings/materials
 * Update material metadata.
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    const allowed = ["title", "description", "language", "access", "sort_order", "group_id"];
    const updateData: Record<string, unknown> = {};
    for (const k of allowed) {
      if (updates[k] !== undefined) updateData[k] = updates[k];
    }

    const { error } = await supabase.from("training_materials").update(updateData).eq("id", id);
    if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });

    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/trainings/materials", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

/**
 * DELETE /api/trainings/materials?id=xxx
 * Delete material and storage file.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();

    // Get file path before deleting record
    const { data: material } = await supabase
      .from("training_materials")
      .select("file_url")
      .eq("id", id)
      .single();

    // Delete from storage
    if (material?.file_url && !material.file_url.startsWith("http")) {
      await supabase.storage.from("training-materials").remove([material.file_url]);
    }

    // Delete DB record (cascade deletes access rows)
    await supabase.from("training_materials").delete().eq("id", id);

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/trainings/materials", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
