import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

/**
 * GET /api/chat/unread
 * Returns total unread message count across all channels the user belongs to.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const userId = session.userId;

    // Get all non-muted channel memberships with last_read_at
    const { data: memberships } = await supabase
      .from("chat_channel_members")
      .select("channel_id, last_read_at")
      .eq("user_id", userId)
      .eq("muted", false);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ unread: 0 });
    }

    const channelIds = memberships.map(
      (m: { channel_id: string }) => m.channel_id
    );
    const lastReadByChannel = new Map<string, string | null>(
      memberships.map(
        (m: { channel_id: string; last_read_at: string | null }) =>
          [m.channel_id, m.last_read_at] as const
      )
    );

    // Pull ids+metadata for candidate unread messages in a single query, then
    // filter per channel's last_read_at on the server. Avoids N count queries.
    // Cap at 2000 rows — plenty for a badge, and bounded memory.
    const { data: recentMsgs } = await supabase
      .from("chat_messages")
      .select("channel_id, created_at, sender_id")
      .in("channel_id", channelIds)
      .is("deleted_at", null)
      .neq("sender_id", userId)
      .order("created_at", { ascending: false })
      .limit(2000);

    let total = 0;
    for (const row of recentMsgs || []) {
      const r = row as {
        channel_id: string;
        created_at: string;
        sender_id: string;
      };
      const cutoff = lastReadByChannel.get(r.channel_id);
      if (!cutoff || r.created_at > cutoff) {
        total += 1;
      }
    }

    return NextResponse.json({ unread: total });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/unread",
      method: "GET",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to fetch unread count" }, { status: 500 });
  }
}
