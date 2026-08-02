import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logAudit } from "@/lib/audit-log";
import { writeLimiter } from "@/lib/rate-limit";
import { fetchAllRows } from "@/lib/supabase-helpers";
import { awardTaskPoints } from "@/lib/task-points";

/**
 * A member's spendable balance is SUM(task_points.points) for that user — same
 * source the leaderboard/level use. Approved redemptions already show up as a
 * negative row there (see PUT below), so the only extra thing to subtract here
 * is redemptions still PENDING (not yet debited), to stop a member requesting
 * more than they actually have once earlier pending requests are accounted for.
 */
async function getAvailableBalance(userId: string): Promise<number> {
  const supabase = getServiceClient();
  const [pointRows, pendingRows] = await Promise.all([
    fetchAllRows<{ points: number }>((from, to) =>
      supabase.from("task_points").select("points").eq("user_id", userId).range(from, to),
    ),
    supabase.from("reward_redemptions").select("points_cost").eq("user_id", userId).eq("status", "pending"),
  ]);
  const lifetime = pointRows.reduce((s, r) => s + r.points, 0);
  const pendingCost = (pendingRows.data || []).reduce((s, r) => s + r.points_cost, 0);
  return lifetime - pendingCost;
}

// GET /api/reward-redemptions — members see their own history; admins see all
// (optionally ?status=pending for the approval queue).
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const admin = await isAdmin(session);
    const supabase = getServiceClient();

    let query = supabase
      .from("reward_redemptions")
      .select("*, users!reward_redemptions_user_id_fkey(name, email)")
      .order("created_at", { ascending: false });

    if (!admin) query = query.eq("user_id", session.userId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Failed to load redemptions" }, { status: 500 });

    const balance = await getAvailableBalance(session.userId);
    return NextResponse.json({ redemptions: data || [], available_points: balance });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/reward-redemptions", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load redemptions" }, { status: 500 });
  }
}

// POST /api/reward-redemptions — member requests a redemption
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });

    const body = await req.json();
    if (!body.reward_id) return NextResponse.json({ error: "reward_id required" }, { status: 400 });

    const supabase = getServiceClient();
    const { data: reward } = await supabase.from("rewards").select("id, title, points_cost, active").eq("id", body.reward_id).single();
    if (!reward || !reward.active) return NextResponse.json({ error: "This reward is not available" }, { status: 400 });

    const balance = await getAvailableBalance(session.userId);
    if (balance < reward.points_cost) {
      return NextResponse.json({ error: `Not enough points — you have ${balance}, this costs ${reward.points_cost}` }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("reward_redemptions")
      .insert({
        user_id: session.userId,
        reward_id: reward.id,
        reward_title: reward.title,
        points_cost: reward.points_cost,
        status: "pending",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: "Failed to submit redemption request" }, { status: 500 });
    logAudit(session.userId, "reward_redemption_requested", "reward_redemption", data.id, { reward_title: reward.title, points_cost: reward.points_cost });
    return NextResponse.json({ redemption: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/reward-redemptions", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to submit redemption request" }, { status: 500 });
  }
}

// PUT /api/reward-redemptions — admin approves or rejects a pending request
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });

    const body = await req.json();
    const { id, action } = body;
    if (!id || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "id and action ('approve'|'reject') required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data: redemption } = await supabase.from("reward_redemptions").select("*").eq("id", id).single();
    if (!redemption) return NextResponse.json({ error: "Redemption not found" }, { status: 404 });
    if (redemption.status !== "pending") return NextResponse.json({ error: `Already ${redemption.status}` }, { status: 409 });

    if (action === "approve") {
      // Re-check balance at decision time — a member could have several pending
      // requests that together exceed what they've since earned/redeemed elsewhere.
      const balance = await getAvailableBalance(redemption.user_id);
      if (balance < redemption.points_cost) {
        return NextResponse.json({ error: `Member no longer has enough points (has ${balance}, needs ${redemption.points_cost}) — reject instead` }, { status: 409 });
      }
      await awardTaskPoints(redemption.user_id, "reward_redeemed", null, -redemption.points_cost, {
        type: "reward_redemption",
        id: redemption.id,
      });
    }

    const { data, error } = await supabase
      .from("reward_redemptions")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        remarks: body.remarks || "",
        decided_by: session.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: "Failed to update redemption" }, { status: 500 });
    logAudit(session.userId, `reward_redemption_${action}d`, "reward_redemption", id, { reward_title: redemption.reward_title, points_cost: redemption.points_cost });
    return NextResponse.json({ redemption: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/reward-redemptions", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update redemption" }, { status: 500 });
  }
}
