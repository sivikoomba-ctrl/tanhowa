import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { writeLimiter, uploadLimiter } from "@/lib/rate-limit";
import { sendPushToUser } from "@/lib/push";
import { broadcastToChannel } from "@/lib/chat-broadcast";

const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function getExtFromType(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  return map[contentType] || "bin";
}

/**
 * GET /api/chat/messages?channel_id=...&before=...&limit=...
 * Cursor-paginated messages for a channel.
 * Requires membership (or channel is_default).
 * Returns ascending order, joins sender info, includes reply_to snippet.
 * Fire-and-forget updates last_read_at.
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

    const before = url.searchParams.get("before"); // ISO timestamp cursor
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

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
        return NextResponse.json({ error: "Not a member of this channel" }, { status: 403 });
      }
    }

    // Build query
    let query = supabase
      .from("chat_messages")
      .select("id, channel_id, sender_id, content, file_url, file_name, file_type, file_size, reply_to, deleted_at, created_at, sender:sender_id(id, name, photo_url)")
      .eq("channel_id", channelId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: messages, error } = await query;

    if (error) {
      await logError({
        type: "api",
        message: error.message,
        path: "/api/chat/messages",
        method: "GET",
        status_code: 500,
      });
      return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
    }

    // Reverse to ascending order
    const items = (messages || []).reverse();

    // Resolve reply_to snippets
    const replyIds = items
      .filter((m: { reply_to: string | null }) => m.reply_to)
      .map((m: { reply_to: string }) => m.reply_to);

    const replyMap = new Map<string, { content: string | null; sender_name: string }>();
    if (replyIds.length > 0) {
      const { data: replies } = await supabase
        .from("chat_messages")
        .select("id, content, sender:sender_id(name)")
        .in("id", replyIds);

      if (replies) {
        for (const r of replies) {
          replyMap.set(r.id, {
            content: r.content ? r.content.substring(0, 100) : null,
            sender_name: (r.sender as unknown as { name: string } | null)?.name || "Unknown",
          });
        }
      }
    }

    // Batch-fetch reactions for all messages in this page
    type ReactionAggregate = {
      emoji: string;
      count: number;
      users: Array<{ id: string; name: string }>;
    };
    const reactionsMap: Record<string, ReactionAggregate[]> = {};
    const messageIds = items.map((m: { id: string }) => m.id);
    if (messageIds.length > 0) {
      const { data: reactionRows } = await supabase
        .from("chat_message_reactions")
        .select("message_id, emoji, user_id, user:user_id(id, name)")
        .in("message_id", messageIds);

      for (const row of reactionRows || []) {
        const r = row as unknown as {
          message_id: string;
          emoji: string;
          user_id: string;
          user: { id: string; name: string } | null;
        };
        const list = reactionsMap[r.message_id] || (reactionsMap[r.message_id] = []);
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
    }

    // Generate signed URLs for file messages
    const enriched = await Promise.all(
      items.map(async (m: Record<string, unknown>) => {
        let signedFileUrl: string | null = null;
        if (m.file_url) {
          const { data: signedData } = await supabase.storage
            .from("chat-files")
            .createSignedUrl(m.file_url as string, 3600);
          signedFileUrl = signedData?.signedUrl || null;
        }

        return {
          id: m.id,
          channel_id: m.channel_id,
          sender_id: m.sender_id,
          content: m.content,
          file_url: signedFileUrl,
          file_name: m.file_name,
          file_type: m.file_type,
          file_size: m.file_size,
          reply_to: m.reply_to,
          reply_snippet: m.reply_to ? replyMap.get(m.reply_to as string) || null : null,
          created_at: m.created_at,
          sender: m.sender || null,
          reactions: reactionsMap[m.id as string] || [],
        };
      })
    );

    // Fire-and-forget: advance last_read_at only when the caller is a member AND
    // the newest visible message is actually newer than their current cursor.
    // Avoids a write on every 30s poll when the thread is idle.
    if (membership && items.length > 0) {
      const newestCreatedAt = items[items.length - 1].created_at as string;
      (async () => {
        const { data: current } = await supabase
          .from("chat_channel_members")
          .select("last_read_at")
          .eq("channel_id", channelId)
          .eq("user_id", userId)
          .single();
        const cursor = (current as { last_read_at: string | null } | null)
          ?.last_read_at;
        if (!cursor || newestCreatedAt > cursor) {
          await supabase
            .from("chat_channel_members")
            .update({ last_read_at: new Date().toISOString() })
            .eq("channel_id", channelId)
            .eq("user_id", userId);
        }
      })().catch(() => {});
    }

    const hasMore = items.length === limit;

    return NextResponse.json({ messages: enriched, has_more: hasMore });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/messages",
      method: "GET",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

/**
 * POST /api/chat/messages
 * Send a text message or file message.
 * Accepts JSON (text only) or FormData (with file).
 * Body/FormData: { channel_id, content?, file?, reply_to? }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const contentType = req.headers.get("content-type") || "";
    const isMultipart = contentType.includes("multipart/form-data");

    let channelId: string | null = null;
    let content: string | null = null;
    let replyTo: string | null = null;
    let fileUrl: string | null = null;
    let fileName: string | null = null;
    let fileType: string | null = null;
    let fileSize: number | null = null;

    if (isMultipart) {
      // Rate limit file uploads more strictly
      if (!uploadLimiter.check(ip)) {
        return NextResponse.json({ error: "Too many uploads. Please wait." }, { status: 429 });
      }

      const formData = await req.formData();
      channelId = formData.get("channel_id") as string | null;
      content = (formData.get("content") as string | null)?.trim() || null;
      replyTo = formData.get("reply_to") as string | null;

      const file = formData.get("file") as File | null;
      if (file) {
        if (!ALLOWED_FILE_TYPES.has(file.type)) {
          return NextResponse.json(
            { error: "File type not allowed. Supported: images, PDF, Word, Excel." },
            { status: 400 }
          );
        }

        if (file.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { error: "File too large. Maximum size is 10MB." },
            { status: 400 }
          );
        }

        const supabase = getServiceClient();
        const ext = getExtFromType(file.type);
        const path = `${channelId}/${session.userId}-${Date.now()}.${ext}`;
        const buffer = Buffer.from(await file.arrayBuffer());

        const { error: uploadError } = await supabase.storage
          .from("chat-files")
          .upload(path, buffer, { contentType: file.type, upsert: true });

        if (uploadError) {
          await logError({
            type: "api",
            message: uploadError.message,
            path: "/api/chat/messages",
            method: "POST",
            status_code: 500,
          });
          return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
        }

        fileUrl = path;
        fileName = file.name;
        fileType = file.type;
        fileSize = file.size;
      }
    } else {
      if (!writeLimiter.check(ip)) {
        return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
      }

      const body = await req.json();
      channelId = body.channel_id;
      content = body.content?.trim() || null;
      replyTo = body.reply_to || null;
    }

    if (!channelId) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    if (!content && !fileUrl) {
      return NextResponse.json({ error: "Message content or file is required" }, { status: 400 });
    }

    if (content && content.length > 4000) {
      return NextResponse.json({ error: "Message too long (max 4000 chars)" }, { status: 400 });
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
        return NextResponse.json({ error: "Not a member of this channel" }, { status: 403 });
      }

      // Auto-join default channel on first message
      await supabase.from("chat_channel_members").insert({
        channel_id: channelId,
        user_id: userId,
        role: "member",
      });
    }

    // Insert message
    const { data: message, error } = await supabase
      .from("chat_messages")
      .insert({
        channel_id: channelId,
        sender_id: userId,
        content,
        file_url: fileUrl,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
        reply_to: replyTo,
      })
      .select("id, channel_id, sender_id, content, file_url, file_name, file_type, file_size, reply_to, created_at")
      .single();

    if (error) {
      await logError({
        type: "api",
        message: error.message,
        path: "/api/chat/messages",
        method: "POST",
        status_code: 500,
      });
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    // Update sender's last_read_at (fire-and-forget)
    supabase
      .from("chat_channel_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .then(() => {});

    // Realtime broadcast so other clients see it without waiting on poll
    (async () => {
      const { data: senderUser } = await supabase
        .from("users")
        .select("id, name, photo_url")
        .eq("id", userId)
        .single();

      let signedFileUrl: string | null = null;
      if (fileUrl) {
        const { data: signed } = await supabase.storage
          .from("chat-files")
          .createSignedUrl(fileUrl, 3600);
        signedFileUrl = signed?.signedUrl || null;
      }

      void broadcastToChannel(channelId, "new_message", {
        ...message,
        file_url: signedFileUrl,
        sender: senderUser,
      });
    })();

    // Push notifications + @mentions processing (fire-and-forget)
    (async () => {
      try {
        const { data: senderUser } = await supabase
          .from("users")
          .select("name")
          .eq("id", userId)
          .single();

        const { data: channelInfo } = await supabase
          .from("chat_channels")
          .select("name")
          .eq("id", channelId)
          .single();

        const senderName = senderUser?.name || "Someone";
        const channelName = channelInfo?.name || "a channel";
        const preview = content
          ? content.substring(0, 80)
          : `Sent a file: ${fileName || "attachment"}`;

        // Parse @mentions from content — match "@Name" tokens (1-5 words, letters/spaces).
        // We intentionally match greedily up to 4 spaces so "@Rajesh Kumar" works.
        const mentionedUserIds = new Set<string>();
        if (content) {
          const mentionRegex = /@([A-Za-z][A-Za-z. ]{0,59})/g;
          const rawNames = new Set<string>();
          let m: RegExpExecArray | null;
          while ((m = mentionRegex.exec(content)) !== null) {
            // Trim trailing whitespace/punctuation; keep full phrase and progressively
            // shorter prefixes so we can match either the full name or just first name.
            const phrase = m[1].trim().replace(/[.,!?;:]+$/, "");
            if (phrase.length >= 2) rawNames.add(phrase);
            const firstTok = phrase.split(/\s+/)[0];
            if (firstTok && firstTok.length >= 2) rawNames.add(firstTok);
          }

          if (rawNames.size > 0) {
            // Only consider users who are members of this channel.
            const { data: memberRows } = await supabase
              .from("chat_channel_members")
              .select("user_id")
              .eq("channel_id", channelId);
            const memberIds = (memberRows || []).map((r) => r.user_id as string);

            if (memberIds.length > 0) {
              // Escape LIKE wildcards so a user typing "@%" or "@_" can't broaden the
              // match to every member in the channel (which would flood push pings).
              const escapeLike = (s: string) =>
                s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
              // Batch all names into a single ILIKE-OR query instead of N round trips.
              const orClause = Array.from(rawNames)
                .map((n) => `name.ilike.%${escapeLike(n)}%`)
                .join(",");
              const { data: matched } = await supabase
                .from("users")
                .select("id, name")
                .in("id", memberIds)
                .or(orClause)
                .limit(50);
              for (const u of matched || []) {
                if (u.id !== userId) {
                  mentionedUserIds.add(u.id as string);
                }
              }
            }
          }

          if (mentionedUserIds.size > 0 && message?.id) {
            const rows = Array.from(mentionedUserIds).map((uid) => ({
              message_id: message.id,
              mentioned_user_id: uid,
            }));
            await supabase
              .from("chat_message_mentions")
              .upsert(rows, { onConflict: "message_id,mentioned_user_id" });

            // Send push to mentioned users with a more prominent mention prefix
            for (const uid of mentionedUserIds) {
              sendPushToUser(uid, {
                title: `@${senderName} mentioned you in #${channelName}`,
                body: preview,
                url: `/dashboard/group-chat?channel=${channelId}`,
              });
            }
          }
        }

        // Regular push to non-muted members, skipping those already notified via mention.
        const { data: members } = await supabase
          .from("chat_channel_members")
          .select("user_id")
          .eq("channel_id", channelId)
          .eq("muted", false)
          .neq("user_id", userId);

        if (members && members.length > 0) {
          for (const m of members) {
            if (mentionedUserIds.has(m.user_id)) continue;
            sendPushToUser(m.user_id, {
              title: `${senderName} in #${channelName}`,
              body: preview,
              url: `/dashboard/group-chat?channel=${channelId}`,
            });
          }
        }
      } catch {
        // Silent fail for push notifications / mentions
      }
    })();

    logContribution(userId, "suggestion_submitted", "Sent chat message");

    return NextResponse.json({ message });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/messages",
      method: "POST",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}

/**
 * DELETE /api/chat/messages?id=...
 * Soft-delete a message. Only the sender or an admin can delete.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const url = new URL(req.url);
    const messageId = url.searchParams.get("id");
    if (!messageId) {
      return NextResponse.json({ error: "Message ID is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Fetch the message to check ownership
    const { data: msg } = await supabase
      .from("chat_messages")
      .select("sender_id, channel_id, file_url")
      .eq("id", messageId)
      .single();

    if (!msg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Allow sender or site admin or channel admin
    const isSender = msg.sender_id === session.userId;
    if (!isSender) {
      const { data: user } = await supabase
        .from("users")
        .select("role")
        .eq("id", session.userId)
        .single();

      const isSiteAdmin = user?.role === "admin" || user?.role === "super_admin";

      if (!isSiteAdmin) {
        const { data: channelMembership } = await supabase
          .from("chat_channel_members")
          .select("role")
          .eq("channel_id", msg.channel_id)
          .eq("user_id", session.userId)
          .single();

        if (!channelMembership || channelMembership.role !== "admin") {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    // Soft-delete
    const { error } = await supabase
      .from("chat_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId);

    if (error) {
      await logError({
        type: "api",
        message: error.message,
        path: "/api/chat/messages",
        method: "DELETE",
        status_code: 500,
      });
      return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
    }

    // Also remove the uploaded file from storage so prior signed URLs (1hr TTL)
    // can't be used to keep viewing a deleted attachment.
    if (msg.file_url) {
      (async () => {
        try {
          await supabase.storage.from("chat-files").remove([msg.file_url as string]);
        } catch {
          // Silent — soft-delete already succeeded; stray file is cleaned up on next pass.
        }
      })();
    }

    void broadcastToChannel(msg.channel_id, "message_deleted", { messageId });

    return NextResponse.json({ message: "Message deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/messages",
      method: "DELETE",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}
