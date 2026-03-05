import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getDbRole } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    const supabase = getServiceClient();

    let query = supabase
      .from("documents")
      .select("*, users(name)")
      .order("created_at", { ascending: false });

    const dbRole = await getDbRole(session.userId);
    if (dbRole === "admin" && status) {
      if (status === "pending") query = query.eq("approved", false);
      else if (status === "approved") query = query.eq("approved", true);
    } else if (dbRole !== "admin") {
      query = query.eq("approved", true);
    }

    const { data: documents } = await query;
    return NextResponse.json({ documents: documents || [] });
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
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("documents")
      .insert({
        title: body.title,
        description: body.description || "",
        file_url: body.file_url,
        file_type: body.file_type,
        category: body.category || "",
        uploaded_by: session.userId,
        approved: (await getDbRole(session.userId)) === "admin",
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/documents", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to upload document" }, { status: 500 });
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

    const { error } = await supabase
      .from("documents")
      .update({ approved: body.approved })
      .eq("id", body.id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/documents", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
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
