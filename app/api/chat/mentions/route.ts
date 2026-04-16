import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

/**
 * GET /api/chat/mentions
 *   - ?unread=true  → list unread mentions (joined with message + sender + channel)
 *   - ?count=true   → integer unread mention count (for nav badge)
 *   - default       → list all mentions (most recent 50)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "true";
    const countOnly = url.searchParams.get("count") === "true";

    const supabase = getServiceClient();
    const userId = session.userId;

    if (countOnly) {
      const { count, error } = await supabase
        .from("chat_message_mentions")
        .select("id", { count: "exact", head: true })
        .eq("mentioned_user_id", userId)
        .is("read_at", null);

      if (error) {
        await logError({
          type: "api",
          message: error.message,
          path: "/api/chat/mentions",
          method: "GET",
          status_code: 500,
        });
        return NextResponse.json({ error: "Failed to fetch mention count" }, { status: 500 });
      }

      return NextResponse.json({ count: count || 0 });
    }

    let query = supabase
      .from("chat_message_mentions")
      .select(
        "id, message_id, read_at, created_at, message:message_id(id, channel_id, sender_id, content, created_at, sender:sender_id(id, name, photo_url), channel:channel_id(id, name))"
      )
      .eq("mentioned_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (unreadOnly) {
      query = query.is("read_at", null);
    }

    const { data, error } = await query;

    if (error) {
      await logError({
        type: "api",
        message: error.message,
        path: "/api/chat/mentions",
        method: "GET",
        status_code: 500,
      });
      return NextResponse.json({ error: "Failed to fetch mentions" }, { status: 500 });
    }

    const items = (data || []).map((row: Record<string, unknown>) => {
      const msg = row.message as unknown as {
        id: string;
        channel_id: string;
        sender_id: string;
        content: string | null;
        created_at: string;
        sender: { id: string; name: string; photo_url: string | null } | null;
        channel: { id: string; name: string } | null;
      } | null;

      return {
        id: row.id,
        message_id: row.message_id,
        read_at: row.read_at,
        created_at: row.created_at,
        message: msg
          ? {
              id: msg.id,
              channel_id: msg.channel_id,
              sender_id: msg.sender_id,
              content: msg.content,
              created_at: msg.created_at,
              sender_name: msg.sender?.name || "Unknown",
              sender_photo: msg.sender?.photo_url || null,
              channel_name: msg.channel?.name || "channel",
            }
          : null,
      };
    });

    return NextResponse.json({ mentions: items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/mentions",
      method: "GET",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to fetch mentions" }, { status: 500 });
  }
}

/**
 * PUT /api/chat/mentions
 * Body: { messageIds: string[] } → mark those mentions as read.
 * Body: {} or no body        → mark ALL of the user's mentions as read.
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let messageIds: string[] | null = null;
    try {
      const body = await req.json();
      if (body && Array.isArray(body.messageIds) && body.messageIds.length > 0) {
        messageIds = body.messageIds.filter((id: unknown): id is string => typeof id === "string");
      }
    } catch {
      // Empty body → mark all
    }

    const supabase = getServiceClient();
    const now = new Date().toISOString();

    let query = supabase
      .from("chat_message_mentions")
      .update({ read_at: now })
      .eq("mentioned_user_id", session.userId)
      .is("read_at", null);

    if (messageIds && messageIds.length > 0) {
      query = query.in("message_id", messageIds);
    }

    const { error } = await query;

    if (error) {
      await logError({
        type: "api",
        message: error.message,
        path: "/api/chat/mentions",
        method: "PUT",
        status_code: 500,
      });
      return NextResponse.json({ error: "Failed to mark mentions as read" }, { status: 500 });
    }

    return NextResponse.json({ message: "Mentions marked as read" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/mentions",
      method: "PUT",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to mark mentions as read" }, { status: 500 });
  }
}
