import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getDbRole } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    const supabase = getServiceClient();
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

      // For admin, also fetch access list per document
      const docIds = (documents || []).map((d: { id: string }) => d.id);
      const accessMap: Record<string, string[]> = {};
      if (docIds.length > 0) {
        const { data: accessRows } = await supabase
          .from("document_access")
          .select("document_id, user_id")
          .in("document_id", docIds);
        for (const row of accessRows || []) {
          if (!accessMap[row.document_id]) accessMap[row.document_id] = [];
          accessMap[row.document_id].push(row.user_id);
        }
      }

      const docsWithAccess = (documents || []).map((d: { id: string; visibility?: string }) => ({
        ...d,
        assigned_users: accessMap[d.id] || [],
      }));

      return NextResponse.json({ documents: docsWithAccess });
    } else {
      // Member: only approved docs they have access to
      query = query.eq("approved", true);
      const { data: allApproved } = await query;

      // Get documents specifically assigned to this user
      const { data: accessRows } = await supabase
        .from("document_access")
        .select("document_id")
        .eq("user_id", session.userId);
      const accessibleDocIds = new Set((accessRows || []).map((r: { document_id: string }) => r.document_id));

      // Filter: show docs with visibility=all OR docs specifically assigned to this user
      const documents = (allApproved || []).filter((d: { id: string; visibility?: string }) => {
        if (!d.visibility || d.visibility === "all") return true;
        return accessibleDocIds.has(d.id);
      });

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

    const supabase = getServiceClient();
    const role = await getDbRole(session.userId);

    const visibility = body.visibility || "all";

    const { data, error } = await supabase
      .from("documents")
      .insert({
        title,
        description: (body.description || "").trim(),
        file_url: body.file_url,
        file_type: body.file_type,
        category: body.category || "",
        uploaded_by: session.userId,
        approved: role === "admin" || role === "super_admin",
        visibility,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/documents", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to upload document" }, { status: 500 });
    }

    // If specific members selected, insert access rows
    if (visibility === "specific" && Array.isArray(body.assigned_users) && body.assigned_users.length > 0) {
      const rows = body.assigned_users.map((userId: string) => ({
        document_id: data.id,
        user_id: userId,
      }));
      await supabase.from("document_access").insert(rows);
    }

    logContribution(session.userId, "document_uploaded", "Uploaded document: " + body.title);

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

    // Build update payload
    const update: Record<string, unknown> = {};
    if (body.approved !== undefined) update.approved = body.approved;
    if (body.visibility !== undefined) update.visibility = body.visibility;

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

    // Update access list if provided
    if (body.assigned_users !== undefined) {
      // Remove old access rows
      await supabase.from("document_access").delete().eq("document_id", body.id);
      // Insert new ones
      if (Array.isArray(body.assigned_users) && body.assigned_users.length > 0) {
        const rows = body.assigned_users.map((userId: string) => ({
          document_id: body.id,
          user_id: userId,
        }));
        await supabase.from("document_access").insert(rows);
      }
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

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/documents", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
