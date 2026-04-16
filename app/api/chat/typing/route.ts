import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { writeLimiter } from "@/lib/rate-limit";
import { broadcastToChannel } from "@/lib/chat-broadcast";

/**
 * POST /api/chat/typing
 * Body: { channel_id }
 * Broadcasts an ephemeral "typing" event to the channel so other clients
 * can display a typing indicator. No DB write — event lives only in Realtime.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      // Silent 200 — typing events are non-critical; throttle happens client-side too
      return NextResponse.json({ ok: true });
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

    // Fetch sender name (fire-and-forget broadcast)
    (async () => {
      try {
        const { data: sender } = await supabase
          .from("users")
          .select("name")
          .eq("id", userId)
          .single();

        const userName = sender?.name || "Someone";
        void broadcastToChannel(channelId, "typing", {
          userId,
          userName,
          channelId,
        });
      } catch {
        // Silent fail — typing is ephemeral
      }
    })();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/typing",
      method: "POST",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to broadcast typing" }, { status: 500 });
  }
}
