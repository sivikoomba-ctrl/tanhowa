import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logAudit } from "@/lib/audit-log";
import { writeLimiter } from "@/lib/rate-limit";

// GET /api/rewards — the catalog. Members get active-only; admins pass ?all=1
// for the full catalog (including inactive items) on the management page.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const all = url.searchParams.get("all") === "1";
    const supabase = getServiceClient();

    let query = supabase.from("rewards").select("*").order("points_cost", { ascending: true });
    if (all) {
      if (!(await isAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else {
      query = query.eq("active", true);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Failed to load rewards" }, { status: 500 });
    return NextResponse.json({ rewards: data || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/rewards", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load rewards" }, { status: 500 });
  }
}

// POST /api/rewards — admin creates a catalog item
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });

    const body = await req.json();
    const title = (body.title || "").trim();
    const pointsCost = parseInt(body.points_cost, 10);
    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    if (!Number.isFinite(pointsCost) || pointsCost <= 0) return NextResponse.json({ error: "Points cost must be a positive number" }, { status: 400 });

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("rewards")
      .insert({
        title,
        description: (body.description || "").trim(),
        points_cost: pointsCost,
        active: body.active !== false,
        image_url: body.image_url || null,
        created_by: session.userId,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: "Failed to create reward" }, { status: 500 });
    logAudit(session.userId, "reward_created", "reward", data.id, { title, points_cost: pointsCost });
    return NextResponse.json({ reward: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/rewards", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create reward" }, { status: 500 });
  }
}

// PUT /api/rewards — admin edits a catalog item (title/description/cost/active/image)
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
      updates.title = title;
    }
    if (body.description !== undefined) updates.description = String(body.description).trim();
    if (body.points_cost !== undefined) {
      const pointsCost = parseInt(body.points_cost, 10);
      if (!Number.isFinite(pointsCost) || pointsCost <= 0) return NextResponse.json({ error: "Points cost must be a positive number" }, { status: 400 });
      updates.points_cost = pointsCost;
    }
    if (body.active !== undefined) updates.active = !!body.active;
    if (body.image_url !== undefined) updates.image_url = body.image_url || null;

    const supabase = getServiceClient();
    const { data, error } = await supabase.from("rewards").update(updates).eq("id", body.id).select().single();
    if (error) return NextResponse.json({ error: "Failed to update reward" }, { status: 500 });
    logAudit(session.userId, "reward_updated", "reward", body.id, updates);
    return NextResponse.json({ reward: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/rewards", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update reward" }, { status: 500 });
  }
}

// DELETE /api/rewards?id=... — admin removes a catalog item. Redemption history
// keeps its own reward_title/points_cost snapshot, so this is always safe.
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    await supabase.from("rewards").delete().eq("id", id);
    logAudit(session.userId, "reward_deleted", "reward", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/rewards", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete reward" }, { status: 500 });
  }
}
