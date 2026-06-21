import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getDbRole } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { logAudit } from "@/lib/audit-log";
import { createInternalDocumentSignedUrl, isAllowedDocumentReference, isInternalDocumentPath, resolveDocumentUrl } from "@/lib/document-urls";
import { getGemini } from "@/lib/gemini";

const SUMMARIZABLE_DOCUMENT_TYPES = new Set(["pdf", "jpg", "jpeg", "png", "webp", "application/pdf", "image/jpeg", "image/png", "image/webp"]);

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const versionsDocId = url.searchParams.get("versions");

    const supabase = getServiceClient();

    // Return version history for a specific document
    if (versionsDocId) {
      const { data: versions } = await supabase
        .from("document_versions")
        .select("*, users(name)")
        .eq("document_id", versionsDocId)
        .order("version_num", { ascending: false });
      return NextResponse.json({ versions: versions || [] });
    }

    const dbRole = await getDbRole(session.userId);

    let query = supabase
      .from("documents")
      .select("*, users(name)")
      .order("created_at", { ascending: false });

    if (dbRole === "admin" || dbRole === "super_admin") {
      // Admin sees all, optionally filtered by approval status
      if (status === "pending") query = query.eq("approved", false);
      else if (status === "approved") query = query.eq("approved", true);

      const { data: documents } = await query;

      // For admin, also fetch access list per document (users + teams)
      const docIds = (documents || []).map((d: { id: string }) => d.id);
      const accessUserMap: Record<string, string[]> = {};
      const accessTeamMap: Record<string, string[]> = {};
      if (docIds.length > 0) {
        const { data: accessRows } = await supabase
          .from("document_access")
          .select("document_id, user_id, team_id")
          .in("document_id", docIds);
        for (const row of accessRows || []) {
          if (row.user_id) {
            if (!accessUserMap[row.document_id]) accessUserMap[row.document_id] = [];
            accessUserMap[row.document_id].push(row.user_id);
          }
          if (row.team_id) {
            if (!accessTeamMap[row.document_id]) accessTeamMap[row.document_id] = [];
            accessTeamMap[row.document_id].push(row.team_id);
          }
        }
      }

      const docsWithAccess = await Promise.all((documents || []).map(async (d: { id: string; visibility?: string; file_url: string }) => ({
        ...d,
        file_url: await resolveDocumentUrl(supabase, d.file_url),
        assigned_users: accessUserMap[d.id] || [],
        assigned_teams: accessTeamMap[d.id] || [],
      })));

      return NextResponse.json({ documents: docsWithAccess });
    } else {
      // Member: only approved docs they have access to
      query = query.eq("approved", true);
      const { data: allApproved } = await query;

      // Get user's team memberships
      const { data: myTeamRows } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", session.userId);
      const myTeamIds = (myTeamRows || []).map((r: { team_id: string }) => r.team_id);

      // Get document_access rows for this user directly OR via their teams
      const [{ data: userAccessRows }, { data: teamAccessRows }] = await Promise.all([
        supabase.from("document_access").select("document_id").eq("user_id", session.userId),
        myTeamIds.length > 0
          ? supabase.from("document_access").select("document_id").in("team_id", myTeamIds)
          : Promise.resolve({ data: [] }),
      ]);

      const accessibleDocIds = new Set([
        ...(userAccessRows || []).map((r: { document_id: string }) => r.document_id),
        ...(teamAccessRows || []).map((r: { document_id: string }) => r.document_id),
      ]);

      // Compute which folders this member can access (folder governs its documents)
      const { data: allFolders } = await supabase.from("document_folders").select("id, visibility");
      const [{ data: folderUserAccess }, { data: folderTeamAccess }] = await Promise.all([
        supabase.from("folder_access").select("folder_id").eq("user_id", session.userId),
        myTeamIds.length > 0
          ? supabase.from("folder_access").select("folder_id").in("team_id", myTeamIds)
          : Promise.resolve({ data: [] }),
      ]);
      const accessibleFolderIds = new Set<string>([
        ...((allFolders || []) as { id: string; visibility?: string }[])
          .filter((f) => !f.visibility || f.visibility === "all")
          .map((f) => f.id),
        ...(folderUserAccess || []).map((r: { folder_id: string }) => r.folder_id),
        ...(folderTeamAccess || []).map((r: { folder_id: string }) => r.folder_id),
      ]);

      // Filter:
      //  - Foldered docs: visible only if the member can access the folder (folder governs).
      //  - Unfiled docs: existing per-document visibility (all OR assigned to user/team).
      const filteredDocuments = (allApproved || []).filter((d: { id: string; visibility?: string; folder_id?: string | null }) => {
        if (d.folder_id) return accessibleFolderIds.has(d.folder_id);
        if (!d.visibility || d.visibility === "all") return true;
        return accessibleDocIds.has(d.id);
      });

      const documents = await Promise.all(filteredDocuments.map(async (d: { file_url: string }) => ({
        ...d,
        file_url: await resolveDocumentUrl(supabase, d.file_url),
      })));

      return NextResponse.json({ documents });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/documents", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const title = (body.title || "").trim();
    if (!title) {
      return NextResponse.json({ error: "Document title is required" }, { status: 400 });
    }
    const fileUrl = typeof body.file_url === "string" ? body.file_url.trim() : "";
    if (!fileUrl || !isAllowedDocumentReference(fileUrl)) {
      return NextResponse.json({ error: "Invalid document URL" }, { status: 400 });
    }
    const fileType = typeof body.file_type === "string" ? body.file_type.trim().toLowerCase() : "";

    const supabase = getServiceClient();
    const role = await getDbRole(session.userId);

    const visibility = body.visibility || "all";

    const { data, error } = await supabase
      .from("documents")
      .insert({
        title,
        description: (body.description || "").trim(),
        file_url: fileUrl,
        file_type: fileType,
        category: body.category || "",
        uploaded_by: session.userId,
        approved: role === "admin" || role === "super_admin",
        visibility,
        folder_id: body.folder_id || null,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/documents", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to upload document" }, { status: 500 });
    }

    // If specific/team access selected, insert user and/or team access rows
    if (visibility === "specific" || visibility === "team") {
      const rows: { document_id: string; user_id?: string; team_id?: string }[] = [];
      if (Array.isArray(body.assigned_users)) {
        for (const userId of body.assigned_users) rows.push({ document_id: data.id, user_id: userId });
      }
      if (Array.isArray(body.assigned_teams)) {
        for (const teamId of body.assigned_teams) rows.push({ document_id: data.id, team_id: teamId });
      }
      if (rows.length > 0) await supabase.from("document_access").insert(rows);
    }

    logContribution(session.userId, "document_uploaded", "Uploaded document: " + body.title);
    logAudit(session.userId, "document_uploaded", "document", data.id);

    // Auto-summarize document (fire-and-forget)
    if (isInternalDocumentPath(fileUrl) && SUMMARIZABLE_DOCUMENT_TYPES.has(fileType)) {
      (async () => {
        try {
          const signedUrl = await createInternalDocumentSignedUrl(supabase, fileUrl);
          if (!signedUrl) return;
          const fileRes = await fetch(signedUrl);
          if (!fileRes.ok) return;
          const buffer = Buffer.from(await fileRes.arrayBuffer());
          if (buffer.length > 10 * 1024 * 1024) return; // Skip files > 10MB

          const genAI = getGemini();
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
          const result = await model.generateContent([
            { inlineData: { data: buffer.toString("base64"), mimeType: fileType.startsWith("image/") || fileType === "application/pdf" ? fileType : fileType === "pdf" ? "application/pdf" : `image/${fileType === "jpg" ? "jpeg" : fileType}` } },
            { text: "Summarize this document in 2-3 sentences. Focus on the main purpose, key details, and any action items. If in Tamil, summarize in both Tamil and English. Be concise." },
          ]);
          const summary = result.response.text().trim();
          if (summary) {
            await supabase.from("documents").update({ summary }).eq("id", data.id);
          }
        } catch { /* silent */ }
      })();
    }

    return NextResponse.json({ document: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/documents", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to upload document" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const supabase = getServiceClient();

    // If updating file_url or title/description, save current version first
    if (body.file_url || body.title || body.description || body.change_summary) {
      const { data: current } = await supabase
        .from("documents")
        .select("id, title, description, file_url")
        .eq("id", body.id)
        .single();

      if (current && current.file_url) {
        // Get the next version number
        const { data: maxVersion } = await supabase
          .from("document_versions")
          .select("version_num")
          .eq("document_id", body.id)
          .order("version_num", { ascending: false })
          .limit(1);

        const nextVersion = (maxVersion && maxVersion.length > 0 ? maxVersion[0].version_num : 0) + 1;

        await supabase.from("document_versions").insert({
          document_id: body.id,
          version_num: nextVersion,
          file_url: current.file_url,
          title: current.title,
          description: current.description,
          change_summary: body.change_summary || null,
          changed_by: session.userId,
        });
      }
    }

    // Build update payload
    const update: Record<string, unknown> = {};
    if (body.approved !== undefined) update.approved = body.approved;
    if (body.visibility !== undefined) update.visibility = body.visibility;
    if (body.folder_id !== undefined) update.folder_id = body.folder_id || null;
    if (body.title !== undefined) update.title = body.title;
    if (body.description !== undefined) update.description = body.description;
    if (body.file_url !== undefined) {
      const fileUrl = typeof body.file_url === "string" ? body.file_url.trim() : "";
      if (!fileUrl || !isAllowedDocumentReference(fileUrl)) {
        return NextResponse.json({ error: "Invalid document URL" }, { status: 400 });
      }
      update.file_url = fileUrl;
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from("documents")
        .update(update)
        .eq("id", body.id);

      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/documents", method: "PUT", status_code: 500 });
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
      }
    }

    // Update access list if provided (users and/or teams)
    if (body.assigned_users !== undefined || body.assigned_teams !== undefined) {
      await supabase.from("document_access").delete().eq("document_id", body.id);
      const rows: { document_id: string; user_id?: string; team_id?: string }[] = [];
      if (Array.isArray(body.assigned_users)) {
        for (const userId of body.assigned_users) rows.push({ document_id: body.id, user_id: userId });
      }
      if (Array.isArray(body.assigned_teams)) {
        for (const teamId of body.assigned_teams) rows.push({ document_id: body.id, team_id: teamId });
      }
      if (rows.length > 0) await supabase.from("document_access").insert(rows);
    }

    if (body.approved !== undefined) {
      logAudit(session.userId, "document_" + (body.approved ? "approved" : "rejected"), "document", body.id);
    }

    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/documents", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

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
    await supabase.from("documents").delete().eq("id", id);
    logAudit(session.userId, "document_deleted", "document", id);

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/documents", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
