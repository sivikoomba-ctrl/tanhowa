import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, hasElectionAccess } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

const POST_STATUSES = ["draft", "nominations_open", "voting_open", "closed"];
const CANDIDATE_STATUSES = ["nominated", "approved", "withdrawn"];

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasElectionAccess(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("election_posts")
      .select("id, title, description, district, display_order, status, created_at, candidates:election_candidates(id, post_id, user_id, name, district, statement, status, created_at)")
      .order("display_order", { ascending: true });

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/elections", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }
    return NextResponse.json({ posts: data || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/elections", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch elections" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasElectionAccess(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = getServiceClient();
    const body = await req.json();

    if (body.type === "candidate") {
      const { post_id, name, district, statement, user_id } = body;
      if (!post_id || !name?.trim()) return NextResponse.json({ error: "post_id and name are required" }, { status: 400 });
      const { data, error } = await supabase
        .from("election_candidates")
        .insert({ post_id, name: name.trim(), district: district || null, statement: statement || null, user_id: user_id || null })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ candidate: data });
    }

    // Default: create a post
    const { title, description, district, display_order } = body;
    if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    const { data, error } = await supabase
      .from("election_posts")
      .insert({ title: title.trim(), description: description || null, district: district?.trim() || null, display_order: display_order ?? 0 })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "A post with this title already exists for that district" }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ post: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/elections", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasElectionAccess(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = getServiceClient();
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    if (body.type === "candidate") {
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = String(body.name).trim();
      if (body.district !== undefined) updates.district = body.district || null;
      if (body.statement !== undefined) updates.statement = body.statement || null;
      if (body.status !== undefined) {
        if (!CANDIDATE_STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        updates.status = body.status;
      }
      const { data, error } = await supabase.from("election_candidates").update(updates).eq("id", body.id).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ candidate: data });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.description !== undefined) updates.description = body.description || null;
    if (body.district !== undefined) updates.district = body.district?.trim() || null;
    if (body.display_order !== undefined) updates.display_order = body.display_order;
    if (body.status !== undefined) {
      if (!POST_STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      updates.status = body.status;
    }
    const { data, error } = await supabase.from("election_posts").update(updates).eq("id", body.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ post: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/elections", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasElectionAccess(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const type = url.searchParams.get("type") || "post";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const table = type === "candidate" ? "election_candidates" : "election_posts";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/elections", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
