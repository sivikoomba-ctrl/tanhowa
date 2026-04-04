import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getOfficialInfo } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logAudit } from "@/lib/audit-log";

/**
 * GET /api/volunteer-invites
 * - Members: returns their own pending invite (if any)
 * - Admins/DS/DJS: returns invites they sent (with ?sent=true) or pending count
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const sent = url.searchParams.get("sent") === "true";

    if (sent) {
      // Admin/DS/DJS: list invites they sent
      const { data } = await supabase
        .from("volunteer_invites")
        .select("id, user_id, district, status, created_at, responded_at, users!volunteer_invites_user_id_fkey(name, email, phone)")
        .eq("invited_by", session.userId)
        .order("created_at", { ascending: false });
      return NextResponse.json({ invites: data || [] });
    }

    // Member: check for pending invite
    const { data: invite } = await supabase
      .from("volunteer_invites")
      .select("id, district, status, created_at, invited_by, users!volunteer_invites_invited_by_fkey(name)")
      .eq("user_id", session.userId)
      .eq("status", "pending")
      .maybeSingle();

    return NextResponse.json({ invite: invite || null });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/volunteer-invites", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

/**
 * POST /api/volunteer-invites
 * Admin/DS/DJS sends an invite to a member.
 * DS/DJS can only invite members from their own district.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

    const supabase = getServiceClient();
    const callerInfo = await getOfficialInfo(session.userId);

    // Get target member details
    const { data: target } = await supabase
      .from("users")
      .select("name, official_type, posting_details")
      .eq("id", userId)
      .single();

    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (target.official_type) {
      return NextResponse.json({ error: "User is already an official" }, { status: 400 });
    }

    const targetDistrict = (target.posting_details as { regular_district?: string } | null)?.regular_district;
    if (!targetDistrict) {
      return NextResponse.json({ error: "Member has no district assigned" }, { status: 400 });
    }

    // DS/DJS: restrict to own district
    const isDistrictOfficial = callerInfo.official_type === "district" && callerInfo.role === "admin";
    const isSuperOrState = callerInfo.role === "super_admin" || callerInfo.official_type === "state";
    if (isDistrictOfficial && !isSuperOrState && targetDistrict !== callerInfo.district) {
      return NextResponse.json({ error: "You can only invite members in your district" }, { status: 403 });
    }

    // Check for existing pending invite
    const { data: existing } = await supabase
      .from("volunteer_invites")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "This member already has a pending invite" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("volunteer_invites")
      .insert({ user_id: userId, invited_by: session.userId, district: targetDistrict })
      .select("id")
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/volunteer-invites", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
    }

    logAudit(session.userId, "volunteer_invited", "user", userId, { district: targetDistrict });

    return NextResponse.json({ message: "Invite sent", id: data.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/volunteer-invites", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
  }
}

/**
 * PUT /api/volunteer-invites
 * Member accepts or declines an invite.
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { action } = await req.json(); // "accept" or "decline"
    if (action !== "accept" && action !== "decline") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Find pending invite for this user
    const { data: invite } = await supabase
      .from("volunteer_invites")
      .select("id, district")
      .eq("user_id", session.userId)
      .eq("status", "pending")
      .maybeSingle();

    if (!invite) {
      return NextResponse.json({ error: "No pending invite found" }, { status: 404 });
    }

    // Update invite status
    await supabase
      .from("volunteer_invites")
      .update({ status: action === "accept" ? "accepted" : "declined", responded_at: new Date().toISOString() })
      .eq("id", invite.id);

    // If accepted, set official_type to volunteer
    if (action === "accept") {
      await supabase
        .from("users")
        .update({ official_type: "volunteer" })
        .eq("id", session.userId);
    }

    logAudit(session.userId, action === "accept" ? "volunteer_accepted" : "volunteer_declined", "volunteer_invite", invite.id);

    return NextResponse.json({
      message: action === "accept" ? "You are now a Volunteer Admin!" : "Invite declined",
      accepted: action === "accept",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/volunteer-invites", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to respond to invite" }, { status: 500 });
  }
}
