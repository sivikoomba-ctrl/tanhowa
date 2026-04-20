/**
 * Group-chat realtime broadcast helper.
 *
 * Uses Supabase Realtime's Broadcast feature via the REST API — server sends,
 * clients subscribe via anon key. No DB RLS is required because broadcast
 * events bypass Postgres (they live only in the Realtime server).
 *
 * Channel topic format: `chat:${channelId}` — scoped per channel.
 *
 * Events:
 *  - new_message     — new message or file
 *  - message_deleted — soft-delete
 *  - message_edited  — { messageId, content, editedAt }
 *  - message_pinned  — { messageId | null } (null = unpinned)
 *  - reaction_added  — { messageId, emoji, userId, userName }
 *  - reaction_removed— { messageId, emoji, userId }
 *  - typing          — { userId, userName } (ephemeral, no DB)
 *  - read            — { userId, lastReadAt } (receipts)
 *
 * Failures are silent — the DB row is already persisted; clients fall back to polling.
 */

type BroadcastEvent =
  | "new_message"
  | "message_deleted"
  | "message_edited"
  | "message_pinned"
  | "reaction_added"
  | "reaction_removed"
  | "typing"
  | "read";

export async function broadcastToChannel(
  channelId: string,
  event: BroadcastEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `chat:${channelId}`,
            event,
            payload,
            private: false,
          },
        ],
      }),
      // Keep alive but don't block the caller
      keepalive: true,
    });
  } catch {
    // Silent fail — clients will catch up on their next poll
  }
}
