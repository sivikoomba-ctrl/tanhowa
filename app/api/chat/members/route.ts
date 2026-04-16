import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { writeLimiter } from "@/lib/rate-limit";

/**
 * GET /api/chat/members?channel_id=...
 * List members of a channel with user info.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const channelId = url.searchParams.get("channel_id");
    if (!channelId) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Verify the requester is a member or channel is default
    const { data: membership } = await supabase
      .from("chat_channel_members")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", session.userId)
      .single();

    if (!membership) {
      const { data: channel } = await supabase
        .from("chat_channels")
        .select("is_default")
        .eq("id", channelId)
        .single();

      if (!channel?.is_default) {
        return NextResponse.json({ error: "Not a member of this channel" }, { status: 403 });
      }
    }

    const { data: members, error } = await supabase
      .from("chat_channel_members")
      .select("id, user_id, role, muted, joined_at, user:user_id(id, name, photo_url, occupation, posting_details)")
      .eq("channel_id", channelId)
      .order("joined_at", { ascending: true });

    if (error) {
      await logError({
        type: "api",
        message: error.message,
        path: "/api/chat/members",
        method: "GET",
        status_code: 500,
      });
      return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
    }

    const items = (members || []).map((m: Record<string, unknown>) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      muted: m.muted,
      joined_at: m.joined_at,
      user: m.user || null,
    }));

    return NextResponse.json({ members: items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/members",
      method: "GET",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

/**
 * PUT /api/chat/members
 * Join, leave, or mute a channel.
 * Body: { channel_id, action: "join" | "leave" | "mute" | "unmute" }
 *
 * Admins can also add/remove others:
 * Body: { channel_id, action: "add" | "remove", user_id }
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const body = await req.json();
    const { channel_id, action, user_id } = body;

    if (!channel_id || !action) {
      return NextResponse.json({ error: "channel_id and action are required" }, { status: 400 });
    }

    const validActions = ["join", "leave", "mute", "unmute", "add", "remove"];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const targetUserId = (action === "add" || action === "remove") ? user_id : session.userId;

    if (!targetUserId) {
      return NextResponse.json({ error: "user_id is required for add/remove" }, { status: 400 });
    }

    // For add/remove, check that requester is admin or channel admin
    if (action === "add" || action === "remove") {
      const siteAdmin = await isAdmin(session);
      if (!siteAdmin) {
        const { data: requesterMembership } = await supabase
          .from("chat_channel_members")
          .select("role")
          .eq("channel_id", channel_id)
          .eq("user_id", session.userId)
          .single();

        if (!requesterMembership || requesterMembership.role !== "admin") {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    switch (action) {
      case "join": {
        // Check channel exists and is not archived
        const { data: channel } = await supabase
          .from("chat_channels")
          .select("id, archived")
          .eq("id", channel_id)
          .single();

        if (!channel || channel.archived) {
          return NextResponse.json({ error: "Channel not found or archived" }, { status: 404 });
        }

        const { error } = await supabase
          .from("chat_channel_members")
          .upsert(
            { channel_id, user_id: targetUserId, role: "member" },
            { onConflict: "channel_id,user_id" }
          );

        if (error) {
          await logError({
            type: "api",
            message: error.message,
            path: "/api/chat/members",
            method: "PUT",
            status_code: 500,
          });
          return NextResponse.json({ error: "Failed to join channel" }, { status: 500 });
        }

        return NextResponse.json({ message: "Joined channel" });
      }

      case "leave": {
        const { error } = await supabase
          .from("chat_channel_members")
          .delete()
          .eq("channel_id", channel_id)
          .eq("user_id", targetUserId);

        if (error) {
          await logError({
            type: "api",
            message: error.message,
            path: "/api/chat/members",
            method: "PUT",
            status_code: 500,
          });
          return NextResponse.json({ error: "Failed to leave channel" }, { status: 500 });
        }

        return NextResponse.json({ message: "Left channel" });
      }

      case "mute": {
        const { error } = await supabase
          .from("chat_channel_members")
          .update({ muted: true })
          .eq("channel_id", channel_id)
          .eq("user_id", targetUserId);

        if (error) {
          await logError({
            type: "api",
            message: error.message,
            path: "/api/chat/members",
            method: "PUT",
            status_code: 500,
          });
          return NextResponse.json({ error: "Failed to mute channel" }, { status: 500 });
        }

        return NextResponse.json({ message: "Channel muted" });
      }

      case "unmute": {
        const { error } = await supabase
          .from("chat_channel_members")
          .update({ muted: false })
          .eq("channel_id", channel_id)
          .eq("user_id", targetUserId);

        if (error) {
          await logError({
            type: "api",
            message: error.message,
            path: "/api/chat/members",
            method: "PUT",
            status_code: 500,
          });
          return NextResponse.json({ error: "Failed to unmute channel" }, { status: 500 });
        }

        return NextResponse.json({ message: "Channel unmuted" });
      }

      case "add": {
        const { error } = await supabase
          .from("chat_channel_members")
          .upsert(
            { channel_id, user_id: targetUserId, role: "member" },
            { onConflict: "channel_id,user_id" }
          );

        if (error) {
          await logError({
            type: "api",
            message: error.message,
            path: "/api/chat/members",
            method: "PUT",
            status_code: 500,
          });
          return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
        }

        return NextResponse.json({ message: "Member added" });
      }

      case "remove": {
        const { error } = await supabase
          .from("chat_channel_members")
          .delete()
          .eq("channel_id", channel_id)
          .eq("user_id", targetUserId);

        if (error) {
          await logError({
            type: "api",
            message: error.message,
            path: "/api/chat/members",
            method: "PUT",
            status_code: 500,
          });
          return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
        }

        return NextResponse.json({ message: "Member removed" });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/members",
      method: "PUT",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to update membership" }, { status: 500 });
  }
}
