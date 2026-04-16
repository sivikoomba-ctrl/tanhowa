import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { writeLimiter } from "@/lib/rate-limit";
import { broadcastToChannel } from "@/lib/chat-broadcast";

/**
 * Per-message reaction aggregate shape returned to the client.
 */
export type ReactionAggregate = {
  emoji: string;
  count: number;
  users: Array<{ id: string; name: string }>;
};

async function verifyChannelAccess(
  supabase: ReturnType<typeof getServiceClient>,
  channelId: string,
  userId: string
): Promise<boolean> {
  const { data: membership } = await supabase
    .from("chat_channel_members")
    .select("id")
    .eq("channel_id", channelId)
    .eq("user_id", userId)
    .single();

  if (membership) return true;

  const { data: channel } = await supabase
    .from("chat_channels")
    .select("is_default")
    .eq("id", channelId)
    .single();

  return !!channel?.is_default;
}

/**
 * POST /api/chat/reactions
 * Body: { message_id, emoji }
 * Adds a reaction for the current user. Idempotent on (message, user, emoji).
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

    const body = await req.json();
    const messageId: string | undefined = body.message_id;
    const emoji: string | undefined = body.emoji;

    if (!messageId || !emoji) {
      return NextResponse.json(
        { error: "message_id and emoji are required" },
        { status: 400 }
      );
    }

    if (emoji.length > 16) {
      return NextResponse.json(
        { error: "emoji too long (max 16 chars)" },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    const userId = session.userId;

    // Find the channel for this message
    const { data: message } = await supabase
      .from("chat_messages")
      .select("id, channel_id")
      .eq("id", messageId)
      .single();

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const hasAccess = await verifyChannelAccess(supabase, message.channel_id, userId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Not a member of this channel" },
        { status: 403 }
      );
    }

    // Insert reaction (ignore duplicates via upsert-style)
    const { error: insertError } = await supabase
      .from("chat_message_reactions")
      .upsert(
        { message_id: messageId, user_id: userId, emoji },
        { onConflict: "message_id,user_id,emoji", ignoreDuplicates: true }
      );

    if (insertError) {
      await logError({
        type: "api",
        message: insertError.message,
        path: "/api/chat/reactions",
        method: "POST",
        status_code: 500,
      });
      return NextResponse.json(
        { error: "Failed to add reaction" },
        { status: 500 }
      );
    }

    // Fetch user's display name for realtime broadcast
    const { data: user } = await supabase
      .from("users")
      .select("name")
      .eq("id", userId)
      .single();

    void broadcastToChannel(message.channel_id, "reaction_added", {
      messageId,
      emoji,
      userId,
      userName: user?.name || "Someone",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/reactions",
      method: "POST",
      status_code: 500,
    });
    return NextResponse.json(
      { error: "Failed to add reaction" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chat/reactions?message_id=...&emoji=...
 * Removes the current user's reaction for a given emoji on a message.
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
    const messageId = url.searchParams.get("message_id");
    const emoji = url.searchParams.get("emoji");

    if (!messageId || !emoji) {
      return NextResponse.json(
        { error: "message_id and emoji are required" },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    const userId = session.userId;

    // Get channel id for broadcasting
    const { data: message } = await supabase
      .from("chat_messages")
      .select("id, channel_id")
      .eq("id", messageId)
      .single();

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("chat_message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .eq("emoji", emoji);

    if (deleteError) {
      await logError({
        type: "api",
        message: deleteError.message,
        path: "/api/chat/reactions",
        method: "DELETE",
        status_code: 500,
      });
      return NextResponse.json(
        { error: "Failed to remove reaction" },
        { status: 500 }
      );
    }

    void broadcastToChannel(message.channel_id, "reaction_removed", {
      messageId,
      emoji,
      userId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/reactions",
      method: "DELETE",
      status_code: 500,
    });
    return NextResponse.json(
      { error: "Failed to remove reaction" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/chat/reactions?message_ids=id1,id2,...
 * Batch-fetches reactions for multiple messages, aggregated per emoji with users list.
 * Returns: { reactions: { [messageId]: ReactionAggregate[] } }
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const raw = url.searchParams.get("message_ids");
    if (!raw) {
      return NextResponse.json({ reactions: {} });
    }

    const messageIds = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (messageIds.length === 0) {
      return NextResponse.json({ reactions: {} });
    }

    // Cap batch size
    if (messageIds.length > 200) {
      return NextResponse.json(
        { error: "Too many message_ids (max 200)" },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    const { data: rows, error } = await supabase
      .from("chat_message_reactions")
      .select("message_id, emoji, user_id, user:user_id(id, name)")
      .in("message_id", messageIds);

    if (error) {
      await logError({
        type: "api",
        message: error.message,
        path: "/api/chat/reactions",
        method: "GET",
        status_code: 500,
      });
      return NextResponse.json(
        { error: "Failed to fetch reactions" },
        { status: 500 }
      );
    }

    // Aggregate: reactions[messageId] = [{ emoji, count, users[] }]
    const reactions: Record<string, ReactionAggregate[]> = {};
    for (const row of rows || []) {
      const r = row as unknown as {
        message_id: string;
        emoji: string;
        user_id: string;
        user: { id: string; name: string } | null;
      };

      const list = reactions[r.message_id] || (reactions[r.message_id] = []);
      let agg = list.find((x) => x.emoji === r.emoji);
      if (!agg) {
        agg = { emoji: r.emoji, count: 0, users: [] };
        list.push(agg);
      }
      agg.count += 1;
      agg.users.push({
        id: r.user?.id || r.user_id,
        name: r.user?.name || "Unknown",
      });
    }

    return NextResponse.json({ reactions });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/reactions",
      method: "GET",
      status_code: 500,
    });
    return NextResponse.json(
      { error: "Failed to fetch reactions" },
      { status: 500 }
    );
  }
}
