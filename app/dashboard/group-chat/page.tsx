"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
}

interface ChannelMember {
  id: string;
  name: string;
  photo_url: string | null;
  occupation: string | null;
  role: string;
  is_channel_admin: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
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

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const threadPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldScrollRef = useRef(false);
  const inputFocusedRef = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);

  // -------------------------------------------------------------------------
  // Fetch current user
  // -------------------------------------------------------------------------
  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.id) setMyId(d.user.id);
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
  // Fetch messages
  // -------------------------------------------------------------------------
  const fetchMessages = useCallback(
    async (channelId: string, before?: string) => {
      try {
        let url = `/api/chat/messages?channel=${channelId}&limit=50`;
        if (before) url += `&before=${encodeURIComponent(before)}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.messages || [];
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

      const msgs: ChatMessage[] = await fetchMessages(channel.id);
      shouldScrollRef.current = true;
      setMessages(msgs);
      setHasMore(msgs.length === 50);
      setLoadingThread(false);
      lastMessageIdRef.current =
        msgs.length > 0 ? msgs[msgs.length - 1].id : null;

      // Clear unread
      setChannels((prev) =>
        prev.map((c) =>
          c.id === channel.id ? { ...c, unread_count: 0 } : c
        )
      );
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
  // Poll messages every 5s
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
            setHasMore(msgs.length === 50);
          }
        }
      }, 5000);
    }

    return () => {
      if (threadPollRef.current) clearInterval(threadPollRef.current);
    };
  }, [selectedChannel, fetchMessages]);

  // -------------------------------------------------------------------------
  // Load older messages
  // -------------------------------------------------------------------------
  const loadMore = async () => {
    if (!selectedChannel || messages.length === 0) return;
    const oldest = messages[0].created_at;
    const olderMsgs: ChatMessage[] = await fetchMessages(
      selectedChannel.id,
      oldest
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
        formData.append("channelId", selectedChannel.id);
        formData.append("file", selectedFile);
        if (newMessage.trim()) formData.append("content", newMessage.trim());
        if (replyTo) formData.append("replyTo", replyTo.id);

        res = await fetch("/api/chat/messages", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId: selectedChannel.id,
            content: newMessage.trim(),
            replyTo: replyTo?.id || undefined,
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
        setMessages((prev) => [...prev, data.message]);
        lastMessageIdRef.current = data.message.id;
      }
      setNewMessage("");
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
      const res = await fetch("/api/chat/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
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
  // Fetch members
  // -------------------------------------------------------------------------
  const fetchMembers = async (channelId: string) => {
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/chat/members?channel=${channelId}`);
      const data = await res.json();
      if (data.members) setMembers(data.members);
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
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => fetchMembers(selectedChannel.id)}
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

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-1"
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

                          {/* Text content */}
                          {msg.content && (
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {msg.content}
                            </p>
                          )}

                          {/* Timestamp */}
                          <p
                            className={`text-[10px] mt-1 text-right ${
                              isMine
                                ? "text-primary/50"
                                : "text-muted-foreground"
                            }`}
                          >
                            {formatTime(msg.created_at)}
                          </p>
                        </div>

                        {/* Actions (hover) */}
                        <div
                          className={`absolute top-5 ${
                            isMine ? "-left-16" : "-right-16"
                          } hidden group-hover:flex items-center gap-0.5`}
                        >
                          <button
                            onClick={() => setReplyTo(msg)}
                            className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                            title="Reply"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                          {isMine && (
                            <button
                              onClick={() => deleteMessage(msg.id)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
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

      {/* Reply bar */}
      {replyTo && (
        <div className="px-3 pt-2 border-t bg-muted/30 flex items-center gap-2">
          <Reply className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-primary">
              {replyTo.sender_id === myId ? "You" : replyTo.sender_name}
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
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* File preview bar */}
      {selectedFile && (
        <div className="px-3 pt-2 border-t bg-muted/30 flex items-center gap-2">
          {isImageType(selectedFile.type) ? (
            <ImageIcon className="w-4 h-4 text-primary shrink-0" />
          ) : (
            <FileText className="w-4 h-4 text-primary shrink-0" />
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
          >
            <X className="w-3.5 h-3.5" />
          </Button>
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
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 h-10 w-10"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <textarea
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              // Auto-resize
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            className="flex-1 rounded-xl min-h-[40px] max-h-[120px] px-3 py-2 text-sm border border-input bg-background shadow-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            maxLength={5000}
            rows={1}
            onFocus={() => {
              inputFocusedRef.current = true;
            }}
            onBlur={() => {
              inputFocusedRef.current = false;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            className="shrink-0 rounded-xl h-10 w-10"
            disabled={(!newMessage.trim() && !selectedFile) || sending}
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
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
