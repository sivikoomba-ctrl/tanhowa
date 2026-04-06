import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { writeLimiter } from "@/lib/rate-limit";
import { sendPushToUser } from "@/lib/push";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const conversations = url.searchParams.get("conversations");
    const withUser = url.searchParams.get("with");
    const unreadCount = url.searchParams.get("unread_count");

    const supabase = getServiceClient();
    const me = session.userId;

    // Mode 3: Just return total unread count
    if (unreadCount === "true") {
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", me)
        .is("read_at", null);

      return NextResponse.json({ count: count || 0 });
    }

    // Mode 1: List conversations
    if (conversations === "true") {
      // Get all messages involving the current user, ordered by newest first
      const { data: messages, error } = await supabase
        .from("messages")
        .select("id, sender_id, recipient_id, content, read_at, created_at")
        .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/messages", method: "GET", status_code: 500 });
        return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
      }

      // Group by the other user
      const convMap = new Map<string, {
        otherId: string;
        lastMessage: string;
        lastMessageTime: string;
        unreadCount: number;
      }>();

      for (const msg of messages || []) {
        const otherId = msg.sender_id === me ? msg.recipient_id : msg.sender_id;

        if (!convMap.has(otherId)) {
          convMap.set(otherId, {
            otherId,
            lastMessage: msg.content,
            lastMessageTime: msg.created_at,
            unreadCount: 0,
          });
        }

        // Count unread messages (where I am the recipient and read_at is null)
        if (msg.recipient_id === me && !msg.read_at) {
          const conv = convMap.get(otherId)!;
          conv.unreadCount++;
        }
      }

      // Get user details for all other users
      const otherIds = Array.from(convMap.keys());
      if (otherIds.length === 0) {
        return NextResponse.json({ conversations: [] });
      }

      const { data: users } = await supabase
        .from("users")
        .select("id, name, photo_url")
        .in("id", otherIds);

      const userMap = new Map<string, { name: string; photo_url: string | null }>();
      for (const u of users || []) {
        userMap.set(u.id, { name: u.name, photo_url: u.photo_url });
      }

      // Build the response
      const convList = Array.from(convMap.values())
        .slice(0, 50)
        .map((c) => {
          const user = userMap.get(c.otherId);
          return {
            userId: c.otherId,
            name: user?.name || "Unknown",
            photoUrl: user?.photo_url || null,
            lastMessage: c.lastMessage,
            lastMessageTime: c.lastMessageTime,
            unreadCount: c.unreadCount,
          };
        });

      return NextResponse.json({ conversations: convList });
    }

    // Mode 2: Get message thread with a specific user
    if (withUser) {
      const before = url.searchParams.get("before");

      let query = supabase
        .from("messages")
        .select("id, sender_id, recipient_id, content, read_at, created_at")
        .or(
          `and(sender_id.eq.${me},recipient_id.eq.${withUser}),and(sender_id.eq.${withUser},recipient_id.eq.${me})`
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (before) {
        query = query.lt("created_at", before);
      }

      const { data: messages, error } = await query;

      if (error) {
        await logError({ type: "api", message: error.message, path: "/api/messages", method: "GET", status_code: 500 });
        return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
      }

      // Mark unread messages from this user as read (fire-and-forget)
      supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("sender_id", withUser)
        .eq("recipient_id", me)
        .is("read_at", null)
        .then(() => {});

      // Return in ascending order for display
      return NextResponse.json({ messages: (messages || []).reverse() });
    }

    return NextResponse.json({ error: "Missing query parameter: conversations, with, or unread_count" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/messages", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

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

    const body = await req.json();
    const to = (body.to || "").trim();
    const content = (body.content || "").trim();

    if (!to) {
      return NextResponse.json({ error: "Recipient is required" }, { status: 400 });
    }

    if (!content || content.length > 5000) {
      return NextResponse.json({ error: "Content must be 1-5000 characters" }, { status: 400 });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(to)) {
      return NextResponse.json({ error: "Invalid recipient ID" }, { status: 400 });
    }

    if (to === session.userId) {
      return NextResponse.json({ error: "Cannot send message to yourself" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: session.userId,
        recipient_id: to,
        content,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/messages", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    // Fire-and-forget: send push notification to recipient
    (async () => {
      try {
        const { data: sender } = await supabase
          .from("users")
          .select("name")
          .eq("id", session.userId)
          .single();

        const senderName = sender?.name || "Someone";
        sendPushToUser(to, {
          title: `New message from ${senderName}`,
          body: content.length > 100 ? content.slice(0, 100) + "..." : content,
          url: "/dashboard/messages",
        }).catch(() => {});
      } catch { /* silent */ }
    })();

    return NextResponse.json({ message: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/messages", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const withUser = (body.with || "").trim();

    if (!withUser) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { error } = await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", withUser)
      .eq("recipient_id", session.userId)
      .is("read_at", null);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/messages", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 });
    }

    return NextResponse.json({ message: "Marked as read" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/messages", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 });
  }
}
