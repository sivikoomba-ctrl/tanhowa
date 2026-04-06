"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Send, ArrowLeft, Search, User } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

interface Conversation {
  userId: string;
  name: string;
  photoUrl: string | null;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

interface SearchUser {
  id: string;
  name: string;
  photo_url: string | null;
  occupation: string | null;
}

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
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function MessagesPage() {
  const t = useT();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; photoUrl: string | null } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<SearchUser[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const threadPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const convPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch current user ID
  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => { if (d.user?.id) setMyId(d.user.id); })
      .catch(() => {});
  }, []);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/messages?conversations=true");
      const data = await res.json();
      if (data.conversations) setConversations(data.conversations);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchConversations().then(() => setLoading(false));
  }, [fetchConversations]);

  // Poll conversations every 15 seconds
  useEffect(() => {
    convPollRef.current = setInterval(fetchConversations, 15000);
    return () => {
      if (convPollRef.current) clearInterval(convPollRef.current);
    };
  }, [fetchConversations]);

  // Fetch thread messages
  const fetchThread = useCallback(async (userId: string, before?: string) => {
    try {
      let url = `/api/messages?with=${userId}`;
      if (before) url += `&before=${encodeURIComponent(before)}`;
      const res = await fetch(url);
      const data = await res.json();
      return data.messages || [];
    } catch {
      toast.error("Failed to load messages");
      return [];
    }
  }, []);

  // Select a conversation
  const selectConversation = useCallback(async (user: { id: string; name: string; photoUrl: string | null }) => {
    setSelectedUser(user);
    setLoadingThread(true);
    setMessages([]);
    setHasMore(false);

    const msgs = await fetchThread(user.id);
    setMessages(msgs);
    setHasMore(msgs.length === 50);
    setLoadingThread(false);

    // Update unread count in conversations
    setConversations((prev) =>
      prev.map((c) => (c.userId === user.id ? { ...c, unreadCount: 0 } : c))
    );
  }, [fetchThread]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Poll thread messages every 10 seconds
  useEffect(() => {
    if (threadPollRef.current) clearInterval(threadPollRef.current);

    if (selectedUser) {
      threadPollRef.current = setInterval(async () => {
        const msgs = await fetchThread(selectedUser.id);
        if (msgs.length > 0) {
          setMessages(msgs);
          setHasMore(msgs.length === 50);
        }
      }, 10000);
    }

    return () => {
      if (threadPollRef.current) clearInterval(threadPollRef.current);
    };
  }, [selectedUser, fetchThread]);

  // Load more messages (scroll to top)
  const loadMore = async () => {
    if (!selectedUser || messages.length === 0) return;
    const oldest = messages[0].created_at;
    const olderMsgs = await fetchThread(selectedUser.id, oldest);
    if (olderMsgs.length > 0) {
      setMessages((prev) => [...olderMsgs, ...prev]);
      setHasMore(olderMsgs.length === 50);
    } else {
      setHasMore(false);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!selectedUser || !newMessage.trim() || sending) return;
    const content = newMessage.trim();
    setSending(true);

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: selectedUser.id, content }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to send");
        return;
      }

      setMessages((prev) => [...prev, data.message]);
      setNewMessage("");

      // Update conversation list
      setConversations((prev) => {
        const existing = prev.find((c) => c.userId === selectedUser.id);
        if (existing) {
          return [
            { ...existing, lastMessage: content, lastMessageTime: data.message.created_at },
            ...prev.filter((c) => c.userId !== selectedUser.id),
          ];
        }
        return [
          {
            userId: selectedUser.id,
            name: selectedUser.name,
            photoUrl: selectedUser.photoUrl,
            lastMessage: content,
            lastMessageTime: data.message.created_at,
            unreadCount: 0,
          },
          ...prev,
        ];
      });
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  // Search members for new message
  useEffect(() => {
    if (!memberSearch.trim() || memberSearch.trim().length < 2) {
      setMemberResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearchingMembers(true);
      try {
        const res = await fetch(`/api/users?search=${encodeURIComponent(memberSearch.trim())}&limit=10`);
        const data = await res.json();
        const users = (data.users || []).filter((u: SearchUser) => u.id !== myId);
        setMemberResults(users);
      } catch {
        setMemberResults([]);
      }
      setSearchingMembers(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [memberSearch, myId]);

  // Start conversation with a searched member
  const startConversation = (user: SearchUser) => {
    setShowNewMessage(false);
    setMemberSearch("");
    setMemberResults([]);
    selectConversation({ id: user.id, name: user.name, photoUrl: user.photo_url });
  };

  // Filter conversations by search query
  const filteredConversations = searchQuery
    ? conversations.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
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

  // --- Conversation List Component ---
  const ConversationList = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            {t("nav.messages") || "Messages"}
          </h1>
          <Button
            size="sm"
            onClick={() => setShowNewMessage(true)}
            className="text-xs h-8"
          >
            + New
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 rounded-xl text-sm"
          />
        </div>
      </div>

      <Separator />

      {/* New Message Search */}
      {showNewMessage && (
        <div className="p-3 border-b bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">New Message</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => { setShowNewMessage(false); setMemberSearch(""); setMemberResults([]); }}
            >
              Cancel
            </Button>
          </div>
          <Input
            placeholder="Search members by name..."
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="h-8 rounded-xl text-sm"
            autoFocus
          />
          {searchingMembers && (
            <p className="text-xs text-muted-foreground px-1">Searching...</p>
          )}
          {memberResults.map((u) => (
            <button
              key={u.id}
              onClick={() => startConversation(u)}
              className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors text-left"
            >
              <Avatar className="w-8 h-8">
                {u.photo_url && <AvatarImage src={u.photo_url} alt={u.name} />}
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {getInitials(u.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{u.name}</p>
                {u.occupation && (
                  <p className="text-xs text-muted-foreground truncate">{u.occupation}</p>
                )}
              </div>
            </button>
          ))}
          {memberSearch.trim().length >= 2 && !searchingMembers && memberResults.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">No members found</p>
          )}
        </div>
      )}

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "No conversations match your search" : "No conversations yet"}
            </p>
            {!searchQuery && (
              <p className="text-xs text-muted-foreground/60 mt-1">
                Click &quot;+ New&quot; to start a conversation
              </p>
            )}
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <button
              key={conv.userId}
              onClick={() => selectConversation({ id: conv.userId, name: conv.name, photoUrl: conv.photoUrl })}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b ${
                selectedUser?.id === conv.userId ? "bg-muted/60" : ""
              }`}
            >
              <Avatar className="w-10 h-10 shrink-0">
                {conv.photoUrl && <AvatarImage src={conv.photoUrl} alt={conv.name} />}
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {getInitials(conv.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate">{conv.name}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                    {timeAgo(conv.lastMessageTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-muted-foreground truncate pr-2">
                    {conv.lastMessage.length > 50 ? conv.lastMessage.slice(0, 50) + "..." : conv.lastMessage}
                  </p>
                  {conv.unreadCount > 0 && (
                    <Badge className="bg-primary text-primary-foreground border-0 text-[10px] h-5 min-w-[20px] shrink-0">
                      {conv.unreadCount}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  // --- Message Thread Component ---
  const MessageThread = () => (
    <div className="flex flex-col h-full">
      {/* Thread Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden shrink-0"
          onClick={() => setSelectedUser(null)}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Avatar className="w-9 h-9 shrink-0">
          {selectedUser?.photoUrl && <AvatarImage src={selectedUser.photoUrl} alt={selectedUser.name} />}
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {selectedUser ? getInitials(selectedUser.name) : <User className="w-4 h-4" />}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{selectedUser?.name}</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-1">
        {loadingThread ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center pb-3">
                <Button variant="ghost" size="sm" className="text-xs" onClick={loadMore}>
                  Load older messages
                </Button>
              </div>
            )}

            {messages.length === 0 && !loadingThread && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No messages yet. Say hello!</p>
              </div>
            )}

            {groupedMessages.map((group, gi) => (
              <div key={gi}>
                <div className="flex items-center justify-center my-3">
                  <span className="text-[10px] text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">
                    {formatDateSeparator(group.date)}
                  </span>
                </div>
                {group.messages.map((msg) => {
                  const isMine = msg.sender_id === myId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex mb-1.5 ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] sm:max-w-[65%] px-3.5 py-2 rounded-2xl ${
                          isMine
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted rounded-bl-md"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        <p
                          className={`text-[10px] mt-1 text-right ${
                            isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                          }`}
                        >
                          {formatTime(msg.created_at)}
                        </p>
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

      {/* Input */}
      <div className="p-3 border-t bg-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex items-end gap-2"
        >
          <Input
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-1 rounded-xl min-h-[40px]"
            maxLength={5000}
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
            disabled={!newMessage.trim() || sending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );

  // --- Layout ---
  return (
    <Card className="h-[calc(100vh-8rem)] overflow-hidden rounded-2xl">
      {/* Desktop: side-by-side */}
      <div className="hidden md:flex h-full">
        <div className="w-80 lg:w-96 border-r flex flex-col h-full">
          <ConversationList />
        </div>
        <div className="flex-1 flex flex-col h-full">
          {selectedUser ? (
            <MessageThread />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <MessageSquare className="w-12 h-12 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">Select a conversation to start messaging</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: full-width toggle */}
      <div className="md:hidden h-full">
        {selectedUser ? (
          <MessageThread />
        ) : (
          <ConversationList />
        )}
      </div>
    </Card>
  );
}
