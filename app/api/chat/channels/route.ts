import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isSuperAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { writeLimiter } from "@/lib/rate-limit";

/**
 * GET /api/chat/channels
 * List channels the user belongs to (or default channels).
 * Returns unread count, last message with sender name, and member count per channel.
 * Sorted by last message desc.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const userId = session.userId;

    // Get all channels the user is a member of
    const { data: memberships } = await supabase
      .from("chat_channel_members")
      .select("channel_id, muted, last_read_at")
      .eq("user_id", userId);

    const memberChannelIds = (memberships || []).map((m: { channel_id: string }) => m.channel_id);
    const memberMap = new Map(
      (memberships || []).map((m: { channel_id: string; muted: boolean; last_read_at: string | null }) => [
        m.channel_id,
        { muted: m.muted, last_read_at: m.last_read_at },
      ])
    );

    // Get default channels user may not have explicitly joined
    const { data: defaultChannels } = await supabase
      .from("chat_channels")
      .select("id")
      .eq("is_default", true)
      .eq("archived", false);

    const defaultIds = (defaultChannels || []).map((c: { id: string }) => c.id);
    const allChannelIds = [...new Set([...memberChannelIds, ...defaultIds])];

    if (allChannelIds.length === 0) {
      return NextResponse.json({ channels: [] });
    }

    // Fetch channel details
    const { data: channels } = await supabase
      .from("chat_channels")
      .select("id, name, description, icon, created_by, is_default, archived, created_at, updated_at")
      .in("id", allChannelIds)
      .eq("archived", false);

    if (!channels || channels.length === 0) {
      return NextResponse.json({ channels: [] });
    }

    const visibleChannelIds = channels.map((c: { id: string }) => c.id);

    // Batch: member counts for all channels in one query (no per-channel round trip).
    const memberCountByChannel = new Map<string, number>();
    {
      const { data: allMembers } = await supabase
        .from("chat_channel_members")
        .select("channel_id")
        .in("channel_id", visibleChannelIds);
      for (const row of allMembers || []) {
        const cid = (row as { channel_id: string }).channel_id;
        memberCountByChannel.set(cid, (memberCountByChannel.get(cid) || 0) + 1);
      }
    }

    // Batch: last (non-deleted) message per channel. Pull a bounded recent window
    // and keep the newest per channel. Avoids N "limit 1" queries.
    const lastMsgByChannel = new Map<
      string,
      {
        id: string;
        content: string | null;
        file_name: string | null;
        created_at: string;
        sender_name: string;
      }
    >();
    {
      const { data: recentMsgs } = await supabase
        .from("chat_messages")
        .select("id, channel_id, content, file_name, created_at, sender:sender_id(name)")
        .in("channel_id", visibleChannelIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      for (const row of recentMsgs || []) {
        const r = row as unknown as {
          id: string;
          channel_id: string;
          content: string | null;
          file_name: string | null;
          created_at: string;
          sender: { name: string } | null;
        };
        if (lastMsgByChannel.has(r.channel_id)) continue;
        lastMsgByChannel.set(r.channel_id, {
          id: r.id,
          content: r.content,
          file_name: r.file_name,
          created_at: r.created_at,
          sender_name: r.sender?.name || "Unknown",
        });
      }
    }

    // Batch: unread counts — pull a bounded recent window across all member
    // channels and filter per membership.last_read_at on the server.
    const unreadByChannel = new Map<string, number>();
    const memberOnlyChannelIds = visibleChannelIds.filter((cid: string) =>
      memberMap.has(cid)
    );
    if (memberOnlyChannelIds.length > 0) {
      const { data: unreadRows } = await supabase
        .from("chat_messages")
        .select("channel_id, created_at")
        .in("channel_id", memberOnlyChannelIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(2000);
      for (const row of unreadRows || []) {
        const r = row as { channel_id: string; created_at: string };
        const m = memberMap.get(r.channel_id);
        if (!m) continue;
        if (!m.last_read_at || r.created_at > m.last_read_at) {
          unreadByChannel.set(
            r.channel_id,
            (unreadByChannel.get(r.channel_id) || 0) + 1
          );
        }
      }
    }

    const enriched = channels.map((ch: Record<string, unknown>) => {
      const channelId = ch.id as string;
      const membership = memberMap.get(channelId);
      const lastMsg = lastMsgByChannel.get(channelId) || null;
      return {
        ...ch,
        member_count: memberCountByChannel.get(channelId) || 0,
        unread_count: unreadByChannel.get(channelId) || 0,
        muted: membership?.muted ?? false,
        is_member: !!membership,
        last_message: lastMsg,
      };
    });

    // Sort by last message desc (channels with no messages go to end)
    enriched.sort((a, b) => {
      const aTime = a.last_message?.created_at || (a as Record<string, unknown>).created_at as string;
      const bTime = b.last_message?.created_at || (b as Record<string, unknown>).created_at as string;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    return NextResponse.json({ channels: enriched });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/channels",
      method: "GET",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to fetch channels" }, { status: 500 });
  }
}

/**
 * POST /api/chat/channels
 * Create a new channel. Admin only.
 * Body: { name, description?, icon?, is_default? }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const body = await req.json();
    const { name, description, icon, is_default } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Channel name is required" }, { status: 400 });
    }

    if (name.trim().length > 100) {
      return NextResponse.json({ error: "Channel name too long (max 100 chars)" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("chat_channels")
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        icon: icon?.trim() || null,
        created_by: session.userId,
        is_default: is_default ?? false,
        archived: false,
      })
      .select()
      .single();

    if (error) {
      await logError({
        type: "api",
        message: error.message,
        path: "/api/chat/channels",
        method: "POST",
        status_code: 500,
      });
      return NextResponse.json({ error: "Failed to create channel" }, { status: 500 });
    }

    // Auto-add creator as admin member
    await supabase.from("chat_channel_members").insert({
      channel_id: data.id,
      user_id: session.userId,
      role: "admin",
    });

    return NextResponse.json({ channel: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/channels",
      method: "POST",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to create channel" }, { status: 500 });
  }
}

/**
 * PUT /api/chat/channels
 * Update a channel. Admin or channel admin only.
 * Body: { id, name?, description?, icon?, is_default?, archived? }
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
    const { id, name, description, icon, is_default, archived } = body;

    if (!id) {
      return NextResponse.json({ error: "Channel ID is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Check if user is site admin or channel admin
    const siteAdmin = await isAdmin(session);
    if (!siteAdmin) {
      const { data: membership } = await supabase
        .from("chat_channel_members")
        .select("role")
        .eq("channel_id", id)
        .eq("user_id", session.userId)
        .single();

      if (!membership || membership.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json({ error: "Channel name cannot be empty" }, { status: 400 });
      }
      updates.name = name.trim();
    }
    if (description !== undefined) updates.description = description?.trim() || null;
    if (icon !== undefined) updates.icon = icon?.trim() || null;
    if (is_default !== undefined && siteAdmin) updates.is_default = is_default;
    if (archived !== undefined && siteAdmin) updates.archived = archived;
    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { error } = await supabase
      .from("chat_channels")
      .update(updates)
      .eq("id", id);

    if (error) {
      await logError({
        type: "api",
        message: error.message,
        path: "/api/chat/channels",
        method: "PUT",
        status_code: 500,
      });
      return NextResponse.json({ error: "Failed to update channel" }, { status: 500 });
    }

    return NextResponse.json({ message: "Channel updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/channels",
      method: "PUT",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to update channel" }, { status: 500 });
  }
}

/**
 * DELETE /api/chat/channels?id=...
 * Archive (soft-delete) a channel. Super admin only.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isSuperAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Channel ID is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { error } = await supabase
      .from("chat_channels")
      .update({ archived: true, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      await logError({
        type: "api",
        message: error.message,
        path: "/api/chat/channels",
        method: "DELETE",
        status_code: 500,
      });
      return NextResponse.json({ error: "Failed to archive channel" }, { status: 500 });
    }

    return NextResponse.json({ message: "Channel archived" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat/channels",
      method: "DELETE",
      status_code: 500,
    });
    return NextResponse.json({ error: "Failed to archive channel" }, { status: 500 });
  }
}
