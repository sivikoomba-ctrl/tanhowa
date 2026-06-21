import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getDbRole } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logAudit } from "@/lib/audit-log";

type AccessRow = { folder_id: string; user_id: string | null; team_id: string | null };

// GET — list folders.
//  Admin: every folder + its access lists + document counts (+ unfiled count).
//  Member: only folders they can access + approved-document counts.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    const dbRole = await getDbRole(session.userId);
    const admin = dbRole === "admin" || dbRole === "super_admin";

    const { data: folders } = await supabase
      .from("document_folders")
      .select("*")
      .order("name", { ascending: true });

    const folderIds = (folders || []).map((f: { id: string }) => f.id);

    // Access rows for all folders
    const { data: accessRows } = folderIds.length
      ? await supabase.from("folder_access").select("folder_id, user_id, team_id").in("folder_id", folderIds)
      : { data: [] as AccessRow[] };

    const accessUserMap: Record<string, string[]> = {};
    const accessTeamMap: Record<string, string[]> = {};
    for (const row of (accessRows || []) as AccessRow[]) {
      if (row.user_id) (accessUserMap[row.folder_id] ||= []).push(row.user_id);
      if (row.team_id) (accessTeamMap[row.folder_id] ||= []).push(row.team_id);
    }

    if (admin) {
      // Document counts per folder + unfiled
      const { data: docs } = await supabase.from("documents").select("id, folder_id");
      const countMap: Record<string, number> = {};
      let unfiledCount = 0;
      for (const d of (docs || []) as { folder_id: string | null }[]) {
        if (d.folder_id) countMap[d.folder_id] = (countMap[d.folder_id] || 0) + 1;
        else unfiledCount++;
      }
      const out = (folders || []).map((f: { id: string }) => ({
        ...f,
        assigned_users: accessUserMap[f.id] || [],
        assigned_teams: accessTeamMap[f.id] || [],
        doc_count: countMap[f.id] || 0,
      }));
      return NextResponse.json({ folders: out, unfiled_count: unfiledCount });
    }

    // Member: which folders are accessible?
    const { data: myTeamRows } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", session.userId);
    const myTeamIds = new Set((myTeamRows || []).map((r: { team_id: string }) => r.team_id));

    const accessible = (folders || []).filter((f: { id: string; visibility?: string }) => {
      if (!f.visibility || f.visibility === "all") return true;
      const users = accessUserMap[f.id] || [];
      const teams = accessTeamMap[f.id] || [];
      return users.includes(session.userId) || teams.some((t) => myTeamIds.has(t));
    });

    // Approved-doc counts for accessible folders only
    const accessibleIds = accessible.map((f: { id: string }) => f.id);
    const countMap: Record<string, number> = {};
    if (accessibleIds.length) {
      const { data: docs } = await supabase
        .from("documents")
        .select("folder_id")
        .eq("approved", true)
        .in("folder_id", accessibleIds);
      for (const d of (docs || []) as { folder_id: string | null }[]) {
        if (d.folder_id) countMap[d.folder_id] = (countMap[d.folder_id] || 0) + 1;
      }
    }

    const out = accessible.map((f: { id: string }) => ({
      id: f.id,
      ...(f as object),
      doc_count: countMap[f.id] || 0,
    }));
    return NextResponse.json({ folders: out });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/document-folders", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
  }
}

async function writeAccess(
  supabase: ReturnType<typeof getServiceClient>,
  folderId: string,
  visibility: string,
  assignedUsers: unknown,
  assignedTeams: unknown,
) {
  await supabase.from("folder_access").delete().eq("folder_id", folderId);
  if (visibility !== "specific" && visibility !== "team") return;
  const rows: { folder_id: string; user_id?: string; team_id?: string }[] = [];
  if (Array.isArray(assignedUsers)) for (const u of assignedUsers) rows.push({ folder_id: folderId, user_id: u });
  if (Array.isArray(assignedTeams)) for (const t of assignedTeams) rows.push({ folder_id: folderId, team_id: t });
  if (rows.length) await supabase.from("folder_access").insert(rows);
}

// POST — create a folder (admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const name = (body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
    const visibility = ["all", "specific", "team"].includes(body.visibility) ? body.visibility : "all";

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("document_folders")
      .insert({ name, description: (body.description || "").trim(), visibility, created_by: session.userId })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "A folder with that name already exists" }, { status: 409 });
      await logError({ type: "api", message: error.message, path: "/api/document-folders", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
    }

    await writeAccess(supabase, data.id, visibility, body.assigned_users, body.assigned_teams);
    logAudit(session.userId, "folder_created", "document_folder", data.id, name);
    return NextResponse.json({ folder: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/document-folders", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}

// PUT — rename / edit description / change access (admin only)
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "Folder ID required" }, { status: 400 });
    const supabase = getServiceClient();

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = (body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
      update.name = name;
    }
    if (body.description !== undefined) update.description = (body.description || "").trim();
    if (body.visibility !== undefined) update.visibility = ["all", "specific", "team"].includes(body.visibility) ? body.visibility : "all";

    if (Object.keys(update).length) {
      const { error } = await supabase.from("document_folders").update(update).eq("id", body.id);
      if (error) {
        if (error.code === "23505") return NextResponse.json({ error: "A folder with that name already exists" }, { status: 409 });
        await logError({ type: "api", message: error.message, path: "/api/document-folders", method: "PUT", status_code: 500 });
        return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
      }
    }

    if (body.visibility !== undefined || body.assigned_users !== undefined || body.assigned_teams !== undefined) {
      const visibility = body.visibility !== undefined ? body.visibility : "all";
      await writeAccess(supabase, body.id, visibility, body.assigned_users, body.assigned_teams);
    }

    logAudit(session.userId, "folder_updated", "document_folder", body.id);
    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/document-folders", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
  }
}

// DELETE — remove a folder (admin only). Documents inside cascade to folder_id = NULL (unfiled).
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    await supabase.from("document_folders").delete().eq("id", id);
    logAudit(session.userId, "folder_deleted", "document_folder", id);
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/document-folders", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}
