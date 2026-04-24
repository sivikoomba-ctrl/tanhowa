"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  MessageCircle,
  Send,
  ArrowLeft,
  Paperclip,
  X,
  Users,
  FileText,
  Image as ImageIcon,
  Download,
  Trash2,
  Reply,
  Loader2,
  SmilePlus,
  Pencil,
  Pin,
  PinOff,
  Search,
  Check,
} from "lucide-react";
import { toast } from "sonner";
// import { useT } from "@/lib/i18n"; // Uncomment when translation keys are added

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Channel {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  member_count: number;
  last_message: string | null;
  last_message_sender: string | null;
  last_message_time: string | null;
  unread_count: number;
}

interface ReactionUser {
  id: string;
  name: string;
}

interface ReactionAggregate {
  emoji: string;
  count: number;
  users: ReactionUser[];
}

interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name: string;
  sender_photo: string | null;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  reply_to: string | null;
  reply_snippet: string | null;
  reply_sender: string | null;
  deleted: boolean;
  created_at: string;
  edited_at?: string | null;
  reactions?: ReactionAggregate[];
}

interface PinnedMessage {
  id: string;
  content: string | null;
  file_name: string | null;
  file_type: string | null;
  created_at: string;
  sender_name: string;
}

// Quick-pick emojis for the reaction popover
const QUICK_EMOJIS = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F389}", "\u{1F64F}", "\u{1F525}", "\u{1F440}", "\u2705"];

interface ChannelMember {
  id: string;
  name: string;
  photo_url: string | null;
  occupation: string | null;
  role: string;
  is_channel_admin: boolean;
  last_read_at?: string | null;
  user_id?: string;
}

interface TypingUser {
  name: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Flattens the API's `{ id, user_id, role, ..., user: { name, photo_url, ... } }`
// shape into the `ChannelMember` shape the UI renders against.
function flattenMember(raw: Record<string, unknown>): ChannelMember {
  const user = (raw.user as {
    id?: string;
    name?: string;
    photo_url?: string | null;
    occupation?: string | null;
  } | null) || null;
  const userId = (raw.user_id as string) || user?.id || "";
  return {
    id: userId || (raw.id as string),
    name: user?.name || "Member",
    photo_url: user?.photo_url || null,
    occupation: user?.occupation || null,
    role: (raw.role as string) || "member",
    is_channel_admin: (raw.role as string) === "admin",
    last_read_at: (raw.last_read_at as string | null) ?? null,
    user_id: userId,
  };
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function isImageType(fileType: string | null): boolean {
  if (!fileType) return false;
  return fileType.startsWith("image/");
}

// ---------------------------------------------------------------------------
// Realtime client (singleton, anon key — broadcast channels only)
// ---------------------------------------------------------------------------

let realtimeClient: ReturnType<typeof createClient> | null = null;
function getRealtimeClient() {
  if (realtimeClient) return realtimeClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  realtimeClient = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return realtimeClient;
}

// ---------------------------------------------------------------------------
// Mention renderer — splits content into text + styled @mention spans
// ---------------------------------------------------------------------------

function renderWithMentions(content: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /@([A-Za-z][A-Za-z. ]{0,59})/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    // Trim trailing spaces from the captured name so only the real name is styled.
    const raw = match[1];
    const trimmed = raw.replace(/\s+$/, "");
    parts.push(
      <span
        key={`m-${idx++}`}
        className="text-primary font-medium bg-primary/10 rounded px-1 py-[1px]"
      >
        @{trimmed}
      </span>
    );
    // Append any trailing whitespace we removed so the original spacing is preserved.
    const trailing = raw.slice(trimmed.length);
    if (trailing) parts.push(trailing);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  return parts.length > 0 ? parts : content;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GroupChatPage() {
  // const t = useT(); // Uncomment when translation keys are added

  // State
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);

  // File attachment
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reply
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

  // Mention typeahead
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionAnchor, setMentionAnchor] = useState<number>(-1);
  const [mentionIndex, setMentionIndex] = useState(0);

  // Reactions: per-message map + open picker state
  const [reactionsByMessage, setReactionsByMessage] = useState<
    Record<string, ReactionAggregate[]>
  >({});
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);
  const myIdRef = useRef<string | null>(null);
  const myNameRef = useRef<string>("You");

  // Typing indicators: { userId: { name, timestamp } }
  const [typingUsers, setTypingUsers] = useState<Record<string, TypingUser>>({});
  const typingUsersRef = useRef<Record<string, TypingUser>>({});
  const lastTypingEmitRef = useRef<number>(0);

  // Edit state — when non-null, we're editing that message's content in-bubble.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Channel admin + site admin — drives pin/unpin button visibility.
  const [canModerate, setCanModerate] = useState(false);

  // Pinned message banner
  const [pinnedMessage, setPinnedMessage] = useState<PinnedMessage | null>(null);

  // In-channel search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const shouldScrollRef = useRef(false);
  const inputFocusedRef = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());

  // -------------------------------------------------------------------------
  // Fetch current user
  // -------------------------------------------------------------------------
  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.id) {
          setMyId(d.user.id);
          myIdRef.current = d.user.id;
        }
        if (d.user?.name) myNameRef.current = d.user.name;
      })
      .catch(() => {});
  }, []);

  // -------------------------------------------------------------------------
  // Fetch channels
  // -------------------------------------------------------------------------
  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/channels");
      const data = await res.json();
      if (data.channels) setChannels(data.channels);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchChannels().then(() => setLoading(false));
  }, [fetchChannels]);

  // Poll channels every 15s
  useEffect(() => {
    channelPollRef.current = setInterval(() => {
      if (inputFocusedRef.current) return;
      fetchChannels();
    }, 15000);
    return () => {
      if (channelPollRef.current) clearInterval(channelPollRef.current);
    };
  }, [fetchChannels]);

  // -------------------------------------------------------------------------
  // Prune stale typing entries (> 5s old) every second
  // -------------------------------------------------------------------------
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const current = typingUsersRef.current;
      let dirty = false;
      const next: Record<string, TypingUser> = {};
      for (const [uid, entry] of Object.entries(current)) {
        if (now - entry.timestamp < 5000) {
          next[uid] = entry;
        } else {
          dirty = true;
        }
      }
      if (dirty) {
        typingUsersRef.current = next;
        setTypingUsers(next);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // -------------------------------------------------------------------------
  // Mark current channel as read (POST /api/chat/read)
  // -------------------------------------------------------------------------
  const markChannelRead = useCallback((channelId: string) => {
    fetch("/api/chat/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: channelId }),
    }).catch(() => {});
  }, []);

  // Mark read whenever a channel is selected/switched
  useEffect(() => {
    if (selectedChannel) markChannelRead(selectedChannel.id);
  }, [selectedChannel, markChannelRead]);

  // Mark read when window regains focus
  useEffect(() => {
    const onFocus = () => {
      if (selectedChannel) markChannelRead(selectedChannel.id);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [selectedChannel, markChannelRead]);

  // -------------------------------------------------------------------------
  // Throttled typing emitter — POST /api/chat/typing at most once every 3s
  // -------------------------------------------------------------------------
  const emitTyping = useCallback(() => {
    if (!selectedChannel) return;
    const now = Date.now();
    if (now - lastTypingEmitRef.current < 3000) return;
    lastTypingEmitRef.current = now;
    fetch("/api/chat/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: selectedChannel.id }),
    }).catch(() => {});
  }, [selectedChannel]);

  // -------------------------------------------------------------------------
  // Fetch messages
  // -------------------------------------------------------------------------
  const fetchMessages = useCallback(
    async (
      channelId: string,
      opts?: { before?: string; q?: string }
    ): Promise<ChatMessage[]> => {
      try {
        let url = `/api/chat/messages?channel=${channelId}&limit=50`;
        if (opts?.before) url += `&before=${encodeURIComponent(opts.before)}`;
        if (opts?.q) url += `&q=${encodeURIComponent(opts.q)}`;
        const res = await fetch(url);
        const data = await res.json();
        const raw = (data.messages || []) as Array<Record<string, unknown>>;
        return raw.map((m) => {
          const snippet = m.reply_snippet as
            | { content: string | null; sender_name: string }
            | null;
          const sender = m.sender as
            | { id: string; name: string; photo_url: string | null }
            | null;
          return {
            id: m.id as string,
            channel_id: m.channel_id as string,
            sender_id: m.sender_id as string,
            sender_name: sender?.name || "Unknown",
            sender_photo: sender?.photo_url || null,
            content: (m.content as string | null) || null,
            file_url: (m.file_url as string | null) || null,
            file_name: (m.file_name as string | null) || null,
            file_type: (m.file_type as string | null) || null,
            file_size: (m.file_size as number | null) || null,
            reply_to: (m.reply_to as string | null) || null,
            reply_snippet: snippet?.content || null,
            reply_sender: snippet?.sender_name || null,
            deleted: Boolean(m.deleted_at),
            created_at: m.created_at as string,
            edited_at: (m.edited_at as string | null) || null,
            reactions: (m.reactions as ReactionAggregate[]) || [],
          };
        });
      } catch {
        toast.error("Failed to load messages");
        return [];
      }
    },
    []
  );

  // -------------------------------------------------------------------------
  // Select channel
  // -------------------------------------------------------------------------
  const selectChannel = useCallback(
    async (channel: Channel) => {
      setSelectedChannel(channel);
      setLoadingThread(true);
      setMessages([]);
      setHasMore(false);
      setReplyTo(null);
      setSelectedFile(null);
      // Reset typing state when switching channels
      typingUsersRef.current = {};
      setTypingUsers({});

      const msgs: ChatMessage[] = await fetchMessages(channel.id);
      shouldScrollRef.current = true;
      setMessages(msgs);
      setHasMore(msgs.length === 50);
      setLoadingThread(false);
      lastMessageIdRef.current =
        msgs.length > 0 ? msgs[msgs.length - 1].id : null;
      knownMessageIdsRef.current = new Set(msgs.map((m) => m.id));

      // Seed reactions map from fetched messages
      const initial: Record<string, ReactionAggregate[]> = {};
      for (const m of msgs) {
        if (m.reactions && m.reactions.length > 0) initial[m.id] = m.reactions;
      }
      setReactionsByMessage(initial);

      // Clear unread
      setChannels((prev) =>
        prev.map((c) =>
          c.id === channel.id ? { ...c, unread_count: 0 } : c
        )
      );

      // Eager-load members for mention typeahead, and derive moderation role
      // (channel-admin badge or site admin) for pin/unpin controls.
      fetch(`/api/chat/members?channel=${channel.id}`)
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d.members)) {
            const mapped = d.members.map(flattenMember);
            setMembers(mapped);
            const mine = mapped.find(
              (m: ChannelMember) => (m.user_id || m.id) === myIdRef.current
            );
            setCanModerate(
              mine?.is_channel_admin === true ||
                mine?.role === "admin" ||
                mine?.role === "super_admin"
            );
          }
        })
        .catch(() => {});

      // Fetch pinned message banner for this channel
      fetch(`/api/chat/pin?channel=${channel.id}`)
        .then((r) => r.json())
        .then((d) => setPinnedMessage(d.pinned || null))
        .catch(() => setPinnedMessage(null));

      // Reset search state on channel switch
      setSearchOpen(false);
      setSearchQuery("");
      setSearchResults(null);

      // Mark any mentions in this channel's messages as read (fire-and-forget)
      const msgIds = msgs.map((m) => m.id);
      if (msgIds.length > 0) {
        fetch("/api/chat/mentions", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageIds: msgIds }),
        }).catch(() => {});
      }
    },
    [fetchMessages]
  );

  // -------------------------------------------------------------------------
  // Auto-scroll
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (shouldScrollRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      shouldScrollRef.current = false;
    }
  }, [messages]);

  // -------------------------------------------------------------------------
  // Poll messages every 30s (Realtime handles the hot path — this is a fallback)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (threadPollRef.current) clearInterval(threadPollRef.current);

    if (selectedChannel) {
      threadPollRef.current = setInterval(async () => {
        if (inputFocusedRef.current) return;
        const msgs: ChatMessage[] = await fetchMessages(selectedChannel.id);
        if (msgs.length > 0) {
          const newLastId = msgs[msgs.length - 1].id;
          if (newLastId !== lastMessageIdRef.current) {
            lastMessageIdRef.current = newLastId;
            const container = messagesContainerRef.current;
            if (container) {
              const nearBottom =
                container.scrollHeight -
                  container.scrollTop -
                  container.clientHeight <
                100;
              if (nearBottom) shouldScrollRef.current = true;
            }
            setMessages(msgs);
            knownMessageIdsRef.current = new Set(msgs.map((m) => m.id));
            setHasMore(msgs.length === 50);
            // Refresh reactions map
            const nextReactions: Record<string, ReactionAggregate[]> = {};
            for (const m of msgs) {
              if (m.reactions && m.reactions.length > 0) nextReactions[m.id] = m.reactions;
            }
            setReactionsByMessage(nextReactions);
          }
        }
      }, 30000);
    }

    return () => {
      if (threadPollRef.current) clearInterval(threadPollRef.current);
    };
  }, [selectedChannel, fetchMessages]);

  // -------------------------------------------------------------------------
  // Realtime broadcast subscription (primary delivery)
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Tear down any previous channel
    if (realtimeChannelRef.current) {
      const client = getRealtimeClient();
      client?.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    if (!selectedChannel) return;

    const client = getRealtimeClient();
    if (!client) return;

    const topic = `chat:${selectedChannel.id}`;
    const ch = client.channel(topic, {
      config: { broadcast: { self: false } },
    });

    ch.on("broadcast", { event: "new_message" }, (evt: { payload: unknown }) => {
      const payload = evt.payload as {
        id: string;
        channel_id: string;
        sender_id: string;
        content: string | null;
        file_url: string | null;
        file_name: string | null;
        file_type: string | null;
        file_size: number | null;
        reply_to: string | null;
        created_at: string;
        sender?: { id: string; name: string; photo_url: string | null } | null;
      } | null;
      if (!payload || !payload.id) return;

      // Dedupe — skip if we already have this message (e.g., sender's own optimistic append)
      if (knownMessageIdsRef.current.has(payload.id)) return;

      const mapped: ChatMessage = {
        id: payload.id,
        channel_id: payload.channel_id,
        sender_id: payload.sender_id,
        sender_name: payload.sender?.name || "Unknown",
        sender_photo: payload.sender?.photo_url || null,
        content: payload.content,
        file_url: payload.file_url,
        file_name: payload.file_name,
        file_type: payload.file_type,
        file_size: payload.file_size,
        reply_to: payload.reply_to,
        reply_snippet: null,
        reply_sender: null,
        deleted: false,
        created_at: payload.created_at,
      };

      const container = messagesContainerRef.current;
      if (container) {
        const nearBottom =
          container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
          120;
        if (nearBottom) shouldScrollRef.current = true;
      }

      knownMessageIdsRef.current.add(payload.id);
      lastMessageIdRef.current = payload.id;
      setMessages((prev) => [...prev, mapped]);

      // Clear the sender from typing state (they just sent something)
      if (payload.sender_id && typingUsersRef.current[payload.sender_id]) {
        const next = { ...typingUsersRef.current };
        delete next[payload.sender_id];
        typingUsersRef.current = next;
        setTypingUsers(next);
      }

      // Update channel preview
      setChannels((prev) =>
        prev.map((c) =>
          c.id === payload.channel_id
            ? {
                ...c,
                last_message: payload.content || payload.file_name || "",
                last_message_sender: payload.sender?.name || null,
                last_message_time: payload.created_at,
              }
            : c
        )
      );
    });

    ch.on(
      "broadcast",
      { event: "message_deleted" },
      (evt: { payload: unknown }) => {
        const payload = evt.payload as { messageId?: string } | null;
        const id = payload?.messageId;
        if (!id) return;
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, deleted: true } : m))
        );
      }
    );

    ch.on(
      "broadcast",
      { event: "message_edited" },
      (evt: { payload: unknown }) => {
        const payload = evt.payload as {
          messageId?: string;
          content?: string;
          editedAt?: string;
        } | null;
        if (!payload?.messageId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.messageId
              ? {
                  ...m,
                  content: payload.content ?? m.content,
                  edited_at: payload.editedAt ?? m.edited_at ?? null,
                }
              : m
          )
        );
      }
    );

    ch.on(
      "broadcast",
      { event: "message_pinned" },
      (evt: { payload: unknown }) => {
        const payload = evt.payload as { messageId?: string | null } | null;
        if (!payload) return;
        if (!payload.messageId) {
          setPinnedMessage(null);
          return;
        }
        // Re-fetch the pin — payload only has the id, we need sender name.
        fetch(
          `/api/chat/pin?channel=${encodeURIComponent(selectedChannel.id)}`
        )
          .then((r) => r.json())
          .then((d) => setPinnedMessage(d.pinned || null))
          .catch(() => {});
      }
    );

    ch.on(
      "broadcast",
      { event: "reaction_added" },
      (evt: { payload: unknown }) => {
        const payload = evt.payload as {
          messageId?: string;
          emoji?: string;
          userId?: string;
          userName?: string;
        } | null;
        if (!payload?.messageId || !payload.emoji || !payload.userId) return;
        // Skip echoes of our own optimistic add
        if (payload.userId === myIdRef.current) return;
        setReactionsByMessage((prev) => {
          const current = prev[payload.messageId!] || [];
          const existing = current.find((r) => r.emoji === payload.emoji);
          if (existing) {
            if (existing.users.some((u) => u.id === payload.userId)) return prev;
            const updated = current.map((r) =>
              r.emoji === payload.emoji
                ? {
                    ...r,
                    count: r.count + 1,
                    users: [
                      ...r.users,
                      { id: payload.userId!, name: payload.userName || "Someone" },
                    ],
                  }
                : r
            );
            return { ...prev, [payload.messageId!]: updated };
          }
          return {
            ...prev,
            [payload.messageId!]: [
              ...current,
              {
                emoji: payload.emoji!,
                count: 1,
                users: [{ id: payload.userId!, name: payload.userName || "Someone" }],
              },
            ],
          };
        });
      }
    );
    ch.on(
      "broadcast",
      { event: "reaction_removed" },
      (evt: { payload: unknown }) => {
        const payload = evt.payload as {
          messageId?: string;
          emoji?: string;
          userId?: string;
        } | null;
        if (!payload?.messageId || !payload.emoji || !payload.userId) return;
        // Skip echoes of our own optimistic remove
        if (payload.userId === myIdRef.current) return;
        setReactionsByMessage((prev) => {
          const current = prev[payload.messageId!] || [];
          const next = current
            .map((r) =>
              r.emoji === payload.emoji
                ? {
                    ...r,
                    count: Math.max(0, r.count - 1),
                    users: r.users.filter((u) => u.id !== payload.userId),
                  }
                : r
            )
            .filter((r) => r.count > 0);
          return { ...prev, [payload.messageId!]: next };
        });
      }
    );
    ch.on("broadcast", { event: "read" }, (evt: { payload: unknown }) => {
      const payload = evt.payload as {
        userId?: string;
        userName?: string;
        channelId?: string;
        lastReadAt?: string;
      } | null;
      if (!payload?.userId || !payload.lastReadAt) return;
      // Ignore our own echoes
      if (payload.userId === myIdRef.current) return;
      // Update the member's last_read_at so own-message receipts refresh live
      setMembers((prev) =>
        prev.map((m) =>
          (m.user_id || m.id) === payload.userId
            ? { ...m, last_read_at: payload.lastReadAt ?? null }
            : m
        )
      );
    });

    ch.on("broadcast", { event: "typing" }, (evt: { payload: unknown }) => {
      const payload = evt.payload as {
        userId?: string;
        userName?: string;
        channelId?: string;
      } | null;
      if (!payload?.userId || !payload.userName) return;
      // Ignore our own echoes
      if (payload.userId === myIdRef.current) return;
      const next = {
        ...typingUsersRef.current,
        [payload.userId]: {
          name: payload.userName,
          timestamp: Date.now(),
        },
      };
      typingUsersRef.current = next;
      setTypingUsers(next);
    });

    ch.subscribe();
    realtimeChannelRef.current = ch;

    return () => {
      if (realtimeChannelRef.current) {
        client.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [selectedChannel]);

  // -------------------------------------------------------------------------
  // Load older messages
  // -------------------------------------------------------------------------
  const loadMore = async () => {
    if (!selectedChannel || messages.length === 0) return;
    const oldest = messages[0].created_at;
    const olderMsgs: ChatMessage[] = await fetchMessages(
      selectedChannel.id,
      { before: oldest }
    );
    if (olderMsgs.length > 0) {
      setMessages((prev) => [...olderMsgs, ...prev]);
      setHasMore(olderMsgs.length === 50);
    } else {
      setHasMore(false);
    }
  };

  // -------------------------------------------------------------------------
  // Send message
  // -------------------------------------------------------------------------
  const sendMessage = async () => {
    if (!selectedChannel || sending) return;
    if (!newMessage.trim() && !selectedFile) return;

    setSending(true);
    try {
      let res: Response;

      if (selectedFile) {
        const formData = new FormData();
        formData.append("channel_id", selectedChannel.id);
        formData.append("file", selectedFile);
        if (newMessage.trim()) formData.append("content", newMessage.trim());
        if (replyTo) formData.append("reply_to", replyTo.id);

        res = await fetch("/api/chat/messages", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel_id: selectedChannel.id,
            content: newMessage.trim(),
            reply_to: replyTo?.id || undefined,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send");
        return;
      }

      shouldScrollRef.current = true;
      if (data.message) {
        const raw = data.message as Record<string, unknown>;
        const mapped: ChatMessage = {
          id: raw.id as string,
          channel_id: raw.channel_id as string,
          sender_id: raw.sender_id as string,
          sender_name: myNameRef.current || "You",
          sender_photo: null,
          content: (raw.content as string | null) || null,
          file_url: (raw.file_url as string | null) || null,
          file_name: (raw.file_name as string | null) || null,
          file_type: (raw.file_type as string | null) || null,
          file_size: (raw.file_size as number | null) || null,
          reply_to: (raw.reply_to as string | null) || null,
          reply_snippet: replyTo?.content ? replyTo.content.substring(0, 100) : null,
          reply_sender: replyTo ? "You" : null,
          deleted: false,
          created_at: raw.created_at as string,
          reactions: [],
        };
        setMessages((prev) => [...prev, mapped]);
        lastMessageIdRef.current = mapped.id;
        knownMessageIdsRef.current.add(mapped.id);
      }
      setNewMessage("");
      setMentionQuery(null);
      setMentionAnchor(-1);
      setSelectedFile(null);
      setReplyTo(null);

      // Update channel list preview
      setChannels((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== selectedChannel.id) return c;
          return {
            ...c,
            last_message: newMessage.trim() || selectedFile?.name || "",
            last_message_sender: "You",
            last_message_time: new Date().toISOString(),
          };
        });
        // Move active channel to top
        const active = updated.find((c) => c.id === selectedChannel.id);
        if (active) {
          return [active, ...updated.filter((c) => c.id !== selectedChannel.id)];
        }
        return updated;
      });
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  // -------------------------------------------------------------------------
  // Delete message
  // -------------------------------------------------------------------------
  const deleteMessage = async (messageId: string) => {
    try {
      const res = await fetch(`/api/chat/messages?id=${encodeURIComponent(messageId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to delete");
        return;
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, deleted: true } : m))
      );
    } catch {
      toast.error("Failed to delete message");
    }
  };

  // -------------------------------------------------------------------------
  // Edit message — inline draft, save via PATCH /api/chat/messages
  // -------------------------------------------------------------------------
  const startEdit = useCallback((msg: ChatMessage) => {
    if (msg.file_url) {
      toast.error("File messages can't be edited");
      return;
    }
    setEditingId(msg.id);
    setEditingDraft(msg.content || "");
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingDraft("");
    setSavingEdit(false);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    const trimmed = editingDraft.trim();
    if (!trimmed) {
      toast.error("Message can't be empty");
      return;
    }
    // Find current content; no-op if unchanged
    const current = messages.find((m) => m.id === editingId);
    if (current && current.content === trimmed) {
      cancelEdit();
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, content: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to edit message");
        return;
      }
      const editedAt =
        (data.message?.edited_at as string | undefined) ||
        new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === editingId ? { ...m, content: trimmed, edited_at: editedAt } : m
        )
      );
      cancelEdit();
    } catch {
      toast.error("Failed to edit message");
    } finally {
      setSavingEdit(false);
    }
  }, [editingId, editingDraft, messages, cancelEdit]);

  // -------------------------------------------------------------------------
  // Pin / unpin a message (admins + channel admins only)
  // -------------------------------------------------------------------------
  const pinMessage = useCallback(async (messageId: string) => {
    try {
      const res = await fetch("/api/chat/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: messageId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to pin message");
        return;
      }
      toast.success("Message pinned");
    } catch {
      toast.error("Failed to pin message");
    }
  }, []);

  const unpinMessage = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(
        `/api/chat/pin?channel_id=${encodeURIComponent(channelId)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to unpin message");
        return;
      }
      setPinnedMessage(null);
      toast.success("Unpinned");
    } catch {
      toast.error("Failed to unpin message");
    }
  }, []);

  // -------------------------------------------------------------------------
  // In-channel search — re-uses /api/chat/messages?q=
  // -------------------------------------------------------------------------
  const runSearch = useCallback(async () => {
    if (!selectedChannel) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = await fetchMessages(selectedChannel.id, { q });
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  }, [selectedChannel, searchQuery, fetchMessages]);

  // -------------------------------------------------------------------------
  // Reactions — add / remove with optimistic updates
  // -------------------------------------------------------------------------
  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    const uid = myIdRef.current;
    if (!uid) return;
    const uname = myNameRef.current || "You";
    setReactionsByMessage((prev) => {
      const current = prev[messageId] || [];
      const existing = current.find((r) => r.emoji === emoji);
      if (existing) {
        if (existing.users.some((u) => u.id === uid)) return prev;
        const updated = current.map((r) =>
          r.emoji === emoji
            ? { ...r, count: r.count + 1, users: [...r.users, { id: uid, name: uname }] }
            : r
        );
        return { ...prev, [messageId]: updated };
      }
      return {
        ...prev,
        [messageId]: [...current, { emoji, count: 1, users: [{ id: uid, name: uname }] }],
      };
    });
    try {
      const res = await fetch("/api/chat/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: messageId, emoji }),
      });
      if (!res.ok) {
        setReactionsByMessage((prev) => {
          const current = prev[messageId] || [];
          const next = current
            .map((r) =>
              r.emoji === emoji
                ? { ...r, count: Math.max(0, r.count - 1), users: r.users.filter((u) => u.id !== uid) }
                : r
            )
            .filter((r) => r.count > 0);
          return { ...prev, [messageId]: next };
        });
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to react");
      }
    } catch {
      toast.error("Failed to react");
    }
  }, []);

  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    const uid = myIdRef.current;
    if (!uid) return;
    let rollback: ReactionAggregate[] | null = null;
    setReactionsByMessage((prev) => {
      const current = prev[messageId] || [];
      rollback = current.map((r) => ({ ...r, users: [...r.users] }));
      const next = current
        .map((r) =>
          r.emoji === emoji
            ? { ...r, count: Math.max(0, r.count - 1), users: r.users.filter((u) => u.id !== uid) }
            : r
        )
        .filter((r) => r.count > 0);
      return { ...prev, [messageId]: next };
    });
    try {
      const res = await fetch(
        `/api/chat/reactions?message_id=${encodeURIComponent(messageId)}&emoji=${encodeURIComponent(emoji)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        if (rollback) setReactionsByMessage((prev) => ({ ...prev, [messageId]: rollback! }));
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to remove reaction");
      }
    } catch {
      if (rollback) setReactionsByMessage((prev) => ({ ...prev, [messageId]: rollback! }));
      toast.error("Failed to remove reaction");
    }
  }, []);

  const toggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      const uid = myIdRef.current;
      if (!uid) return;
      const current = reactionsByMessage[messageId] || [];
      const existing = current.find((r) => r.emoji === emoji);
      if (existing && existing.users.some((u) => u.id === uid)) {
        removeReaction(messageId, emoji);
      } else {
        addReaction(messageId, emoji);
      }
    },
    [reactionsByMessage, addReaction, removeReaction]
  );

  // Close picker on outside click / escape
  useEffect(() => {
    if (!pickerOpenFor) return;
    const close = () => setPickerOpenFor(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [pickerOpenFor]);

  // -------------------------------------------------------------------------
  // Fetch members
  // -------------------------------------------------------------------------
  const fetchMembers = async (channelId: string) => {
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/chat/members?channel=${channelId}`);
      const data = await res.json();
      if (Array.isArray(data.members)) {
        setMembers(data.members.map(flattenMember));
      }
    } catch {
      toast.error("Failed to load members");
    } finally {
      setLoadingMembers(false);
    }
  };

  // -------------------------------------------------------------------------
  // File picker
  // -------------------------------------------------------------------------
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10 MB");
      return;
    }
    setSelectedFile(file);
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // -------------------------------------------------------------------------
  // @mention typeahead — filter members by current query
  // -------------------------------------------------------------------------
  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.trim().toLowerCase();
    const pool = members.filter((m) => m.id !== myId);
    if (!q) return pool.slice(0, 6);
    return pool
      .filter((m) => m.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, members, myId]);

  // Reset highlighted index whenever the match list changes
  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery, mentionMatches.length]);

  // Detect @... context at the caret position inside the textarea
  const updateMentionState = useCallback((value: string, caret: number) => {
    // Walk backwards from the caret looking for a "@" that starts a word.
    let i = caret - 1;
    let atIndex = -1;
    while (i >= 0) {
      const ch = value[i];
      if (ch === "@") {
        // Must be at start of string or preceded by whitespace
        if (i === 0 || /\s/.test(value[i - 1])) {
          atIndex = i;
        }
        break;
      }
      if (ch === "\n" || ch === "\r") break;
      // Allow letters, spaces, dots, and common name chars; break on other punctuation
      if (!/[A-Za-z. ]/.test(ch)) break;
      i--;
    }
    if (atIndex === -1) {
      setMentionQuery(null);
      setMentionAnchor(-1);
      return;
    }
    const query = value.slice(atIndex + 1, caret);
    // If the tail has an excessive run of spaces (likely user ended mention), close.
    if (/ {3,}/.test(query)) {
      setMentionQuery(null);
      setMentionAnchor(-1);
      return;
    }
    setMentionQuery(query);
    setMentionAnchor(atIndex);
  }, []);

  const insertMention = useCallback(
    (name: string) => {
      if (mentionAnchor < 0 || !textareaRef.current) return;
      const el = textareaRef.current;
      const caret = el.selectionStart ?? newMessage.length;
      const before = newMessage.slice(0, mentionAnchor);
      const after = newMessage.slice(caret);
      const insertion = `@${name} `;
      const next = before + insertion + after;
      setNewMessage(next);
      setMentionQuery(null);
      setMentionAnchor(-1);
      // Restore focus + caret position after React updates DOM
      requestAnimationFrame(() => {
        const newCaret = (before + insertion).length;
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCaret, newCaret);
        }
      });
    },
    [mentionAnchor, newMessage]
  );

  // -------------------------------------------------------------------------
  // Group messages by date
  // -------------------------------------------------------------------------
  const groupedMessages: { date: string; messages: ChatMessage[] }[] = [];
  let currentDate = "";
  for (const msg of messages) {
    const msgDate = new Date(msg.created_at).toDateString();
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msg.created_at, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  }

  // -------------------------------------------------------------------------
  // Read receipts — per own-message, compute readers from members state
  // -------------------------------------------------------------------------
  const myOwnMessages = messages.filter((m) => m.sender_id === myId && !m.deleted);
  const latestOwnMessageId =
    myOwnMessages.length > 0 ? myOwnMessages[myOwnMessages.length - 1].id : null;

  // Pre-compute readers keyed by message id (only for own messages)
  const readersByMessageId = new Map<string, { id: string; name: string }[]>();
  for (const own of myOwnMessages) {
    const createdMs = new Date(own.created_at).getTime();
    const readers: { id: string; name: string }[] = [];
    for (const m of members) {
      const uid = m.user_id || m.id;
      if (!uid || uid === myId) continue;
      if (!m.last_read_at) continue;
      const readMs = new Date(m.last_read_at).getTime();
      if (readMs >= createdMs) {
        readers.push({ id: uid, name: m.name || "Member" });
      }
    }
    readersByMessageId.set(own.id, readers);
  }

  function renderReadReceipts(msgId: string): React.ReactNode {
    const readers = readersByMessageId.get(msgId);
    if (!readers || readers.length === 0) return null;
    const isLatest = msgId === latestOwnMessageId;
    if (!isLatest) {
      const tooltip =
        readers.length > 6
          ? `Read by ${readers.slice(0, 6).map((r) => r.name).join(", ")} +${readers.length - 6} more`
          : `Read by ${readers.map((r) => r.name).join(", ")}`;
      return (
        <p
          className="text-[10px] mt-0.5 text-right text-primary/60"
          title={tooltip}
        >
          •
        </p>
      );
    }
    let label: string;
    if (readers.length > 3) {
      const first = readers.slice(0, 3).map((r) => r.name).join(", ");
      label = `Read by ${first} +${readers.length - 3} more`;
    } else {
      label = `Read by ${readers.map((r) => r.name).join(", ")}`;
    }
    return (
      <p className="text-[10px] mt-0.5 text-right text-primary/60">{label}</p>
    );
  }

  // -------------------------------------------------------------------------
  // Typing indicator text
  // -------------------------------------------------------------------------
  const typingNames = Object.values(typingUsers).map((t) => t.name);
  let typingText: string | null = null;
  if (typingNames.length === 1) typingText = `${typingNames[0]} is typing…`;
  else if (typingNames.length === 2)
    typingText = `${typingNames[0]} and ${typingNames[1]} are typing…`;
  else if (typingNames.length >= 3) typingText = "Several people are typing…";

  const typingJsx = typingText ? (
    <div className="px-4 py-1.5 text-[11px] text-muted-foreground italic flex items-center gap-2 border-t bg-muted/20">
      <span className="inline-flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse" />
        <span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:150ms]" />
        <span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:300ms]" />
      </span>
      <span>{typingText}</span>
    </div>
  ) : null;

  // =========================================================================
  // Channel List Panel
  // =========================================================================
  const channelListJsx = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 space-y-1">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          Group Chat
        </h1>
        <p className="text-xs text-muted-foreground">
          Channels for team discussions
        </p>
      </div>

      <Separator />

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageCircle className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No channels available
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Channels will appear here once created by admin
            </p>
          </div>
        ) : (
          channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => selectChannel(channel)}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b ${
                selectedChannel?.id === channel.id ? "bg-muted/60" : ""
              }`}
            >
              <div className="w-10 h-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate">{channel.name}</p>
                  {channel.last_message_time && (
                    <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                      {timeAgo(channel.last_message_time)}
                    </span>
                  )}
                </div>
                {channel.description && (
                  <p className="text-[11px] text-muted-foreground/70 truncate">
                    {channel.description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-muted-foreground truncate pr-2">
                    {channel.last_message_sender && channel.last_message ? (
                      <>
                        <span className="font-medium">
                          {channel.last_message_sender}:
                        </span>{" "}
                        {channel.last_message.length > 40
                          ? channel.last_message.slice(0, 40) + "..."
                          : channel.last_message}
                      </>
                    ) : (
                      <span className="italic text-muted-foreground/50">
                        No messages yet
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Users className="w-3 h-3" />
                      {channel.member_count}
                    </span>
                    {channel.unread_count > 0 && (
                      <Badge className="bg-primary text-primary-foreground border-0 text-[10px] h-5 min-w-[20px]">
                        {channel.unread_count}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  // =========================================================================
  // Chat Thread Panel
  // =========================================================================
  const chatThreadJsx = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden shrink-0"
          onClick={() => setSelectedChannel(null)}
          aria-label="Back to channel list"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="w-9 h-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
          <MessageCircle className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">
            {selectedChannel?.name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {selectedChannel?.member_count} members
          </p>
        </div>
        {selectedChannel && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => {
              setSearchOpen((o) => {
                const next = !o;
                if (!next) {
                  setSearchQuery("");
                  setSearchResults(null);
                }
                return next;
              });
            }}
            title="Search in channel"
            aria-label="Search in channel"
            aria-expanded={searchOpen}
          >
            <Search className="w-5 h-5" />
          </Button>
        )}
        {selectedChannel && (
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => fetchMembers(selectedChannel.id)}
                aria-label={`View channel members (${selectedChannel.member_count})`}
              >
                <Users className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 sm:w-96">
              <SheetHeader>
                <SheetTitle>
                  Channel Members ({selectedChannel.member_count})
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-1 overflow-y-auto max-h-[calc(100vh-8rem)]">
                {loadingMembers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No members found
                  </p>
                ) : (
                  members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors"
                    >
                      <Avatar className="w-9 h-9 shrink-0">
                        {member.photo_url && (
                          <AvatarImage
                            src={member.photo_url}
                            alt={member.name}
                          />
                        )}
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">
                            {member.name}
                          </p>
                          {member.is_channel_admin && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-4 px-1.5 border-primary/30 text-primary"
                            >
                              Admin
                            </Badge>
                          )}
                          {(member.role === "admin" ||
                            member.role === "super_admin") && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-4 px-1.5 border-amber-500/30 text-amber-600"
                            >
                              {member.role === "super_admin"
                                ? "State-Admin"
                                : "Admin"}
                            </Badge>
                          )}
                        </div>
                        {member.occupation && (
                          <p className="text-xs text-muted-foreground truncate">
                            {member.occupation}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {/* Pinned message banner */}
      {pinnedMessage && !searchOpen && (
        <div className="flex items-start gap-2 px-3 py-2 border-b bg-amber-50 text-amber-900">
          <Pin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700">
              Pinned • {pinnedMessage.sender_name}
            </p>
            <p className="text-xs line-clamp-2 break-words">
              {pinnedMessage.content ||
                pinnedMessage.file_name ||
                "Attachment"}
            </p>
          </div>
          {canModerate && selectedChannel && (
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 shrink-0 text-amber-700 hover:text-amber-900"
              onClick={() => unpinMessage(selectedChannel.id)}
              title="Unpin"
              aria-label="Unpin message"
            >
              <PinOff className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      )}

      {/* Search bar */}
      {searchOpen && (
        <div className="px-3 py-2 border-b bg-muted/20 flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runSearch();
              } else if (e.key === "Escape") {
                setSearchOpen(false);
                setSearchQuery("");
                setSearchResults(null);
              }
            }}
            placeholder="Search in this channel…"
            className="flex-1 min-w-0 text-sm bg-transparent outline-none"
            autoFocus
            maxLength={200}
          />
          <Button
            size="sm"
            className="h-7"
            onClick={runSearch}
            disabled={!searchQuery.trim() || searching}
          >
            {searching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              "Search"
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 shrink-0"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery("");
              setSearchResults(null);
            }}
            aria-label="Close search"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Search results panel (shown only when search has run) */}
      {searchOpen && searchResults !== null && (
        <div className="flex-1 overflow-y-auto bg-muted/10">
          {searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                No messages match “{searchQuery}”
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {searchResults.map((m) => (
                <div key={m.id} className="px-4 py-3 hover:bg-muted/40">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-medium text-primary">
                      {m.sender_name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatTime(m.created_at)} ·{" "}
                      {formatDateSeparator(m.created_at)}
                    </p>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {m.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        className={`flex-1 overflow-y-auto p-4 space-y-1 ${
          searchOpen && searchResults !== null ? "hidden" : ""
        }`}
      >
        {loadingThread ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center pb-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={loadMore}
                >
                  Load older messages
                </Button>
              </div>
            )}

            {messages.length === 0 && !loadingThread && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MessageCircle className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No messages yet. Start the conversation!
                </p>
              </div>
            )}

            {groupedMessages.map((group, gi) => (
              <div key={gi}>
                {/* Date separator */}
                <div className="flex items-center justify-center my-3">
                  <span className="text-[10px] text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">
                    {formatDateSeparator(group.date)}
                  </span>
                </div>

                {group.messages.map((msg) => {
                  const isMine = msg.sender_id === myId;

                  // Deleted message
                  if (msg.deleted) {
                    return (
                      <div
                        key={msg.id}
                        className={`flex mb-2 ${isMine ? "justify-end" : "justify-start"}`}
                      >
                        <div className="max-w-[75%] sm:max-w-[65%] px-3.5 py-2 rounded-xl bg-muted/40 border border-dashed border-muted-foreground/20">
                          <p className="text-xs italic text-muted-foreground">
                            This message was deleted
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex mb-2 ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      {/* Avatar (others only) */}
                      {!isMine && (
                        <Avatar className="w-7 h-7 shrink-0 mt-5 mr-2">
                          {msg.sender_photo && (
                            <AvatarImage
                              src={msg.sender_photo}
                              alt={msg.sender_name}
                            />
                          )}
                          <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                            {getInitials(msg.sender_name)}
                          </AvatarFallback>
                        </Avatar>
                      )}

                      <div
                        className={`max-w-[75%] sm:max-w-[65%] group relative ${
                          isMine ? "items-end" : "items-start"
                        }`}
                      >
                        {/* Sender name (others) */}
                        {!isMine && (
                          <p className="text-[11px] font-medium text-muted-foreground mb-0.5 ml-1">
                            {msg.sender_name}
                          </p>
                        )}

                        {/* Bubble */}
                        <div
                          className={`px-3.5 py-2 rounded-xl ${
                            isMine
                              ? "bg-primary/10 border border-primary/20 rounded-br-md"
                              : "bg-muted rounded-bl-md"
                          }`}
                        >
                          {/* Reply indicator */}
                          {msg.reply_snippet && (
                            <div className="mb-1.5 pl-2 border-l-2 border-primary/40">
                              <p className="text-[10px] font-medium text-primary/70">
                                {msg.reply_sender || "Someone"}
                              </p>
                              <p className="text-[11px] text-muted-foreground line-clamp-1">
                                {msg.reply_snippet}
                              </p>
                            </div>
                          )}

                          {/* File content */}
                          {msg.file_url && (
                            <div className="mb-1.5">
                              {isImageType(msg.file_type) ? (
                                <a
                                  href={msg.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={msg.file_url}
                                    alt={msg.file_name || "Image"}
                                    className="max-h-48 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                  />
                                </a>
                              ) : (
                                <a
                                  href={msg.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 p-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors"
                                >
                                  <FileText className="w-8 h-8 text-primary/60 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">
                                      {msg.file_name || "File"}
                                    </p>
                                    {msg.file_size && (
                                      <p className="text-[10px] text-muted-foreground">
                                        {formatFileSize(msg.file_size)}
                                      </p>
                                    )}
                                  </div>
                                  <Download className="w-4 h-4 text-muted-foreground shrink-0" />
                                </a>
                              )}
                            </div>
                          )}

                          {/* Text content — inline edit when active */}
                          {editingId === msg.id ? (
                            <div className="space-y-1">
                              <textarea
                                value={editingDraft}
                                onChange={(e) => setEditingDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    saveEdit();
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelEdit();
                                  }
                                }}
                                className="w-full min-w-[200px] text-sm rounded-md border border-input bg-background px-2 py-1 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                rows={Math.min(
                                  4,
                                  Math.max(1, editingDraft.split("\n").length)
                                )}
                                maxLength={4000}
                                autoFocus
                              />
                              <div className="flex gap-1 justify-end">
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  disabled={savingEdit}
                                  className="text-[10px] px-2 py-0.5 rounded hover:bg-muted/60"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={saveEdit}
                                  disabled={savingEdit || !editingDraft.trim()}
                                  className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-1"
                                >
                                  {savingEdit ? (
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  ) : (
                                    <Check className="w-2.5 h-2.5" />
                                  )}
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            msg.content && (
                              <p className="text-sm whitespace-pre-wrap break-words">
                                {renderWithMentions(msg.content)}
                              </p>
                            )
                          )}

                          {/* Timestamp + edited marker */}
                          <p
                            className={`text-[10px] mt-1 text-right ${
                              isMine
                                ? "text-primary/50"
                                : "text-muted-foreground"
                            }`}
                          >
                            {formatTime(msg.created_at)}
                            {msg.edited_at && (
                              <span
                                className="ml-1 italic"
                                title={`Edited ${formatTime(msg.edited_at)}`}
                              >
                                (edited)
                              </span>
                            )}
                          </p>
                        </div>

                        {/* Read receipts (own messages only) */}
                        {isMine && renderReadReceipts(msg.id)}

                        {/* Actions (hover on desktop, always visible if picker open) */}
                        <div
                          className={`absolute top-5 ${
                            isMine ? "-left-20" : "-right-20"
                          } ${
                            pickerOpenFor === msg.id ? "flex" : "hidden group-hover:flex"
                          } items-center gap-0.5 z-10`}
                        >
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPickerOpenFor(
                                  pickerOpenFor === msg.id ? null : msg.id
                                );
                              }}
                              onTouchStart={(e) => {
                                // Long-press fallback for mobile: open picker on touch
                                e.stopPropagation();
                              }}
                              className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                              title="Add reaction"
                              aria-label="Add reaction to message"
                              aria-haspopup="menu"
                              aria-expanded={pickerOpenFor === msg.id}
                            >
                              <SmilePlus className="w-3.5 h-3.5" />
                            </button>
                            {pickerOpenFor === msg.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className={`absolute top-full mt-1 ${
                                  isMine ? "right-0" : "left-0"
                                } z-20 flex items-center gap-0.5 p-1.5 rounded-xl border bg-popover shadow-md`}
                              >
                                {QUICK_EMOJIS.map((em) => (
                                  <button
                                    key={em}
                                    type="button"
                                    onClick={() => {
                                      addReaction(msg.id, em);
                                      setPickerOpenFor(null);
                                    }}
                                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted/70 text-base"
                                    title={`React with ${em}`}
                                  >
                                    {em}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => setReplyTo(msg)}
                            className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                            title="Reply"
                            aria-label={`Reply to ${msg.sender_name}'s message`}
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                          {canModerate && (
                            <button
                              onClick={() => pinMessage(msg.id)}
                              className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-amber-600 transition-colors"
                              title="Pin"
                              aria-label="Pin message to channel"
                            >
                              <Pin className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isMine && !msg.file_url && (
                            <button
                              onClick={() => startEdit(msg)}
                              className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                              title="Edit"
                              aria-label="Edit your message"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isMine && (
                            <button
                              onClick={() => deleteMessage(msg.id)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="Delete"
                              aria-label="Delete your message"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Reaction chips */}
                        {(reactionsByMessage[msg.id] || []).length > 0 && (
                          <div
                            className={`mt-1 flex flex-wrap gap-1 ${
                              isMine ? "justify-end" : "justify-start"
                            }`}
                          >
                            {(reactionsByMessage[msg.id] || []).map((r) => {
                              const mine = !!myId && r.users.some((u) => u.id === myId);
                              const tooltip = r.users
                                .map((u) => (u.id === myId ? "You" : u.name))
                                .join(", ");
                              return (
                                <button
                                  key={r.emoji}
                                  type="button"
                                  onClick={() => toggleReaction(msg.id, r.emoji)}
                                  title={tooltip}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
                                    mine
                                      ? "bg-primary/15 border-primary/40 text-foreground"
                                      : "bg-muted/60 border-transparent hover:bg-muted"
                                  }`}
                                >
                                  <span className="text-sm leading-none">{r.emoji}</span>
                                  <span className="font-medium">{r.count}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Typing indicator */}
      {typingJsx}

      {/* Input-context bar — reply context and file preview used to render
          as two separate full-width strips stacked above the input, each
          with its own `border-t bg-muted/30`. When both were active you
          got a visible seam between them. Merged into one container with
          a single top border + background so it reads as a single
          "context attached to what I'm typing" block. Inner divider
          only appears when both rows are present. */}
      {(replyTo || selectedFile) && (
        <div className="border-t bg-muted/30">
          {replyTo && (
            <div className="px-3 py-2 flex items-center gap-2">
              <Reply className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-primary">
                  Replying to {replyTo.sender_id === myId ? "you" : replyTo.sender_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {replyTo.content || replyTo.file_name || "Attachment"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6 shrink-0"
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
          {replyTo && selectedFile && (
            // Visually separate the reply and attachment without
            // duplicating the outer border / background.
            <div className="border-t border-muted-foreground/10 mx-3" aria-hidden="true" />
          )}
          {selectedFile && (
            <div className="px-3 py-2 flex items-center gap-2">
              {isImageType(selectedFile.type) ? (
                <ImageIcon className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
              ) : (
                <FileText className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{selectedFile.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6 shrink-0"
                onClick={() => setSelectedFile(null)}
                aria-label="Remove attached file"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="p-3 border-t bg-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex items-end gap-2"
        >
          {/* File input (hidden) */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.xls,.xlsx"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 h-10 w-10"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            aria-label="Attach a file"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <div className="relative flex-1">
            {/* Mention typeahead dropdown */}
            {mentionQuery !== null && mentionMatches.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-1 max-h-56 overflow-y-auto rounded-xl border bg-popover shadow-md z-20">
                {mentionMatches.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseDown={(e) => {
                      // Use mousedown so focus stays on textarea
                      e.preventDefault();
                      insertMention(m.name);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/70 ${
                      i === mentionIndex ? "bg-muted/60" : ""
                    }`}
                  >
                    <Avatar className="w-6 h-6 shrink-0">
                      {m.photo_url && (
                        <AvatarImage src={m.photo_url} alt={m.name} />
                      )}
                      <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                        {getInitials(m.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      {m.occupation && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {m.occupation}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              placeholder="Type a message... use @ to mention"
              value={newMessage}
              onChange={(e) => {
                const v = e.target.value;
                setNewMessage(v);
                // Auto-resize
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                // Mention detection
                const caret = e.target.selectionStart ?? v.length;
                updateMentionState(v, caret);
                // Throttled typing broadcast (only if user actually typed content)
                if (v.trim().length > 0) emitTyping();
              }}
              onClick={(e) => {
                const el = e.currentTarget;
                updateMentionState(el.value, el.selectionStart ?? el.value.length);
              }}
              onKeyUp={(e) => {
                if (
                  e.key === "ArrowLeft" ||
                  e.key === "ArrowRight" ||
                  e.key === "Home" ||
                  e.key === "End"
                ) {
                  const el = e.currentTarget;
                  updateMentionState(el.value, el.selectionStart ?? el.value.length);
                }
              }}
              className="w-full rounded-xl min-h-[40px] max-h-[120px] px-3 py-2 text-sm border border-input bg-background shadow-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              maxLength={4000}
              rows={1}
              onFocus={() => {
                inputFocusedRef.current = true;
              }}
              onBlur={() => {
                inputFocusedRef.current = false;
                // Let click/mousedown on dropdown items fire before closing
                setTimeout(() => setMentionQuery(null), 150);
              }}
              onKeyDown={(e) => {
                const typeaheadOpen =
                  mentionQuery !== null && mentionMatches.length > 0;
                if (typeaheadOpen) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMentionIndex((i) => (i + 1) % mentionMatches.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex(
                      (i) =>
                        (i - 1 + mentionMatches.length) % mentionMatches.length
                    );
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    const pick = mentionMatches[mentionIndex];
                    if (pick) insertMention(pick.name);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMentionQuery(null);
                    setMentionAnchor(-1);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
          </div>
          <Button
            type="submit"
            size="icon"
            className="shrink-0 rounded-xl h-10 w-10"
            disabled={(!newMessage.trim() && !selectedFile) || sending}
            aria-label={sending ? "Sending message" : "Send message"}
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-4 h-4" aria-hidden="true" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );

  // =========================================================================
  // Layout
  // =========================================================================
  return (
    <Card className="h-[calc(100vh-8rem)] overflow-hidden rounded-2xl">
      {/* Desktop: side-by-side */}
      <div className="hidden md:flex h-full">
        <div className="w-80 lg:w-96 border-r flex flex-col h-full">
          {channelListJsx}
        </div>
        <div className="flex-1 flex flex-col h-full">
          {selectedChannel ? (
            chatThreadJsx
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <MessageCircle className="w-12 h-12 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">
                Select a channel to start chatting
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: full-width toggle */}
      <div className="md:hidden h-full">
        {selectedChannel ? chatThreadJsx : channelListJsx}
      </div>
    </Card>
  );
}
