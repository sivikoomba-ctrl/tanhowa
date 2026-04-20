import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, type SessionPayload } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { writeLimiter } from "@/lib/rate-limit";
import { broadcastToChannel } from "@/lib/chat-broadcast";

/**
 * Authorization: pin/unpin is allowed for site admins or the channel's own
 * admin. Regular members cannot pin even their own messages — otherwise any
 * sender could promote their own message to the channel header.
 */
async function canModerate(
  supabase: ReturnType<typeof getServiceClient>,
  session: SessionPayload,
  channelId: string
): Promise<boolean> {
  if (await isAdmin(session)) return true;
  const { data: m } = await supabase
    .from("chat_channel_members")
    .select("role")
    .eq("channel_id", channelId)
    .eq("user_id", session.userId)
    .single();
  return m?.role === "admin";
}

/**
 * POST /api/chat/pin
 * Body: { message_id }
 * Pin a message to its channel. Replaces any existing pin on that channel.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const messageId: string | undefined = body.message_id;
    if (!messageId) {
      return NextResponse.json({ error: "message_id is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data: message } = await supabase
      .from("chat_messages")
      .select("id, channel_id, deleted_at")
      .eq("id", messageId)
      .single();

    if (!message || message.deleted_at) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (!(await canModerate(supabase, session, message.channel_id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("chat_channels")
      .update({ pinned_message_id: messageId, updated_at: new Date().toISOString() })
      .eq("id", message.channel_id);

    if (error) {
      await logError({
        type: "api",
        message: error.message,
        path: "/api/chat/pin",
        method: "POST",
        status_code: 500,
      });
      return NextResponse.json({ error: "Failed to pin message" }, { status: 500 });
    }

    void broadcastToChannel(message.channel_id, "message_pinned", {
      messageId,
    });

    return NextResponse.json({ ok: true, pinned_message_id: messageId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/pin",
      method: "POST",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to pin message" }, { status: 500 });
  }
}

/**
 * DELETE /api/chat/pin?channel_id=...
 * Unpin the currently pinned message on a channel.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait." },
        { status: 429 }
      );
    }

    const url = new URL(req.url);
    const channelId = url.searchParams.get("channel_id") || url.searchParams.get("channel");
    if (!channelId) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    if (!(await canModerate(supabase, session, channelId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("chat_channels")
      .update({ pinned_message_id: null, updated_at: new Date().toISOString() })
      .eq("id", channelId);

    if (error) {
      await logError({
        type: "api",
        message: error.message,
        path: "/api/chat/pin",
        method: "DELETE",
        status_code: 500,
      });
      return NextResponse.json({ error: "Failed to unpin message" }, { status: 500 });
    }

    void broadcastToChannel(channelId, "message_pinned", { messageId: null });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/pin",
      method: "DELETE",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to unpin message" }, { status: 500 });
  }
}

/**
 * GET /api/chat/pin?channel_id=...
 * Fetch the currently pinned message for a channel, hydrated with sender
 * name and reply snippet. Returns `{ pinned: null }` if no pin.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const channelId = url.searchParams.get("channel_id") || url.searchParams.get("channel");
    if (!channelId) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const userId = session.userId;

    // Access check: caller must be a member or the channel must be default.
    const { data: membership } = await supabase
      .from("chat_channel_members")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .single();

    if (!membership) {
      const { data: channel } = await supabase
        .from("chat_channels")
        .select("is_default")
        .eq("id", channelId)
        .single();
      if (!channel?.is_default) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { data: channel } = await supabase
      .from("chat_channels")
      .select("pinned_message_id")
      .eq("id", channelId)
      .single();

    const pinnedId = channel?.pinned_message_id as string | null | undefined;
    if (!pinnedId) {
      return NextResponse.json({ pinned: null });
    }

    const { data: msg } = await supabase
      .from("chat_messages")
      .select("id, content, file_name, file_type, created_at, deleted_at, sender:sender_id(id, name)")
      .eq("id", pinnedId)
      .single();

    if (!msg || msg.deleted_at) {
      // Self-heal: stale pin → clear it so other clients don't keep fetching.
      await supabase
        .from("chat_channels")
        .update({ pinned_message_id: null })
        .eq("id", channelId);
      return NextResponse.json({ pinned: null });
    }

    return NextResponse.json({
      pinned: {
        id: msg.id,
        content: msg.content,
        file_name: msg.file_name,
        file_type: msg.file_type,
        created_at: msg.created_at,
        sender_name:
          (msg.sender as unknown as { name: string } | null)?.name || "Unknown",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/pin",
      method: "GET",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to fetch pin" }, { status: 500 });
  }
}
