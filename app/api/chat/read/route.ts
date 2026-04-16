import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { writeLimiter } from "@/lib/rate-limit";
import { broadcastToChannel } from "@/lib/chat-broadcast";

/**
 * POST /api/chat/read
 * Body: { channel_id }
 * Marks the channel as read for the current user (updates last_read_at = now())
 * and broadcasts a "read" event so other clients can refresh receipts in realtime.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const channelId: string | undefined = body.channel_id || body.channelId;
    if (!channelId) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const userId = session.userId;

    // Verify membership or default channel
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
        return NextResponse.json(
          { error: "Not a member of this channel" },
          { status: 403 }
        );
      }
    }

    const lastReadAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("chat_channel_members")
      .update({ last_read_at: lastReadAt })
      .eq("channel_id", channelId)
      .eq("user_id", userId);

    if (updateError) {
      await logError({
        type: "api",
        message: updateError.message,
        path: "/api/chat/read",
        method: "POST",
        status_code: 500,
      });
      return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 });
    }

    // Fire-and-forget broadcast so other clients can update receipts live
    (async () => {
      try {
        const { data: user } = await supabase
          .from("users")
          .select("name")
          .eq("id", userId)
          .single();

        const userName = user?.name || "Someone";
        void broadcastToChannel(channelId, "read", {
          userId,
          userName,
          channelId,
          lastReadAt,
        });
      } catch {
        // Silent fail
      }
    })();

    return NextResponse.json({ ok: true, last_read_at: lastReadAt });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/read",
      method: "POST",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 });
  }
}
