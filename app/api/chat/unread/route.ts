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

    // Get all channel memberships with last_read_at
    const { data: memberships } = await supabase
      .from("chat_channel_members")
      .select("channel_id, last_read_at")
      .eq("user_id", userId)
      .eq("muted", false);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ unread: 0 });
    }

    // Count unread messages per channel in parallel
    const counts = await Promise.all(
      memberships.map(async (m: { channel_id: string; last_read_at: string | null }) => {
        let query = supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", m.channel_id)
          .is("deleted_at", null)
          .neq("sender_id", userId);

        if (m.last_read_at) {
          query = query.gt("created_at", m.last_read_at);
        }

        const { count } = await query;
        return count || 0;
      })
    );

    const total = counts.reduce((sum, c) => sum + c, 0);

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
