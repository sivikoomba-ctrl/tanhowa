"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  MessageCircle, Send, X, Flower2, User, Database,
  Megaphone, CalendarDays, Users, FileText, Trophy,
  ClipboardList, GraduationCap, BarChart3, CreditCard,
  Sparkles, RotateCcw,
} from "lucide-react";
import { useT } from "@/lib/i18n";

interface Message {
  role: "user" | "bot";
  text: string;
}

// Quick query categories with icons
const QUICK_QUERIES = [
  { icon: Megaphone, key: "chat.q_announcements", fallback: "What are the latest announcements?" },
  { icon: CalendarDays, key: "chat.q_events", fallback: "Any upcoming events?" },
  { icon: CreditCard, key: "chat.q_subscriptions", fallback: "What's my subscription status?" },
  { icon: ClipboardList, key: "chat.q_tasks", fallback: "Show my pending tasks" },
  { icon: Users, key: "chat.q_members", fallback: "How many members are there?" },
  { icon: GraduationCap, key: "chat.q_trainings", fallback: "Any upcoming trainings?" },
  { icon: Trophy, key: "chat.q_achievements", fallback: "Show my badges" },
  { icon: BarChart3, key: "chat.q_contributions", fallback: "How active am I on the portal?" },
  { icon: FileText, key: "chat.q_documents", fallback: "What documents are available?" },
] as const;

// Simple markdown-to-JSX renderer for bot messages
function RenderMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  function flushList() {
    if (listItems.length === 0) return;
    const items = listItems.map((item, i) => <li key={i}>{formatInline(item)}</li>);
    if (listType === "ol") {
      elements.push(<ol key={elements.length} className="list-decimal list-inside space-y-0.5 my-1">{items}</ol>);
    } else {
      elements.push(<ul key={elements.length} className="list-disc list-inside space-y-0.5 my-1">{items}</ul>);
    }
    listItems = [];
    listType = null;
  }

  function formatInline(str: string): React.ReactNode {
    // Bold **text**
    const parts = str.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Bullet list
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      if (listType === "ol") flushList();
      listType = "ul";
      listItems.push(bulletMatch[1]);
      continue;
    }

    // Numbered list
    const numMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (numMatch) {
      if (listType === "ul") flushList();
      listType = "ol";
      listItems.push(numMatch[1]);
      continue;
    }

    flushList();

    if (trimmed === "") {
      elements.push(<br key={elements.length} />);
    } else if (trimmed.startsWith("### ")) {
      elements.push(<p key={elements.length} className="font-semibold text-xs mt-1.5 mb-0.5">{formatInline(trimmed.slice(4))}</p>);
    } else if (trimmed.startsWith("## ")) {
      elements.push(<p key={elements.length} className="font-bold text-sm mt-2 mb-0.5">{formatInline(trimmed.slice(3))}</p>);
    } else {
      elements.push(<p key={elements.length} className="my-0.5">{formatInline(trimmed)}</p>);
    }
  }
  flushList();

  return <div className="space-y-0">{elements}</div>;
}

// Allowed roles/types for query engine chatbot
const ALLOWED_EMAILS = ["tanhowa19791@gmail.com", "tanhowaadmin@tanhowa.in"];

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQuickQueries, setShowQuickQueries] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null); // null = loading
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  // Check if current user is allowed (super_admin, state official, or test account)
  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.user) { setAllowed(false); return; }
        const u = data.user;
        const isAllowed =
          u.role === "super_admin" ||
          u.official_type === "state" ||
          ALLOWED_EMAILS.includes(u.email);
        setAllowed(isAllowed);
      })
      .catch(() => setAllowed(false));
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowQuickQueries(false);
    setLoading(true);

    try {
      const history = messages.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        text: m.text,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
      });

      const data = await res.json();

      if (res.ok && data.reply) {
        setMessages((prev) => [...prev, { role: "bot", text: data.reply }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "bot", text: data.error || t("chat.error") },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: t("chat.unable_connect") },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, t]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Don't render if not allowed or still checking
  if (allowed !== true) return null;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    await sendMessage(input);
  }

  function handleClose() {
    setOpen(false);
  }

  function handleReset() {
    setMessages([]);
    setInput("");
    setShowQuickQueries(false);
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 flex items-center justify-center group"
          aria-label="Open chat"
        >
          <MessageCircle size={24} />
          {/* Pulse indicator */}
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-secondary rounded-full border-2 border-background animate-pulse" />
        </button>
      )}

      {/* Chat panel */}
      <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col">
          {/* Header */}
          <SheetHeader className="px-4 py-3 border-b bg-primary text-primary-foreground">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-primary-foreground">
                <Flower2 size={20} />
                {t("chat.title")}
              </SheetTitle>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={handleReset}
                    className="text-primary-foreground/60 hover:text-primary-foreground p-1 rounded-md hover:bg-white/10 transition-colors"
                    title="New conversation"
                  >
                    <RotateCcw size={15} />
                  </button>
                )}
                <button onClick={handleClose} className="text-primary-foreground/80 hover:text-primary-foreground p-1">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Database size={11} className="text-primary-foreground/60" />
              <p className="text-xs text-primary-foreground/70">
                {t("chat.subtitle_query") || "Powered by live portal data"}
              </p>
            </div>
          </SheetHeader>

          {/* Messages area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
            {/* Welcome screen */}
            {messages.length === 0 && (
              <div className="py-4">
                <div className="text-center mb-5">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                    <Sparkles size={28} className="text-primary" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {t("chat.hello")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("chat.ask_data") || "I can search announcements, events, members, documents, and more from the portal."}
                  </p>
                </div>

                {/* Quick query grid */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground px-1">
                    {t("chat.try_asking") || "Try asking:"}
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {QUICK_QUERIES.slice(0, 5).map((q) => {
                      const Icon = q.icon;
                      const label = t(q.key) || q.fallback;
                      return (
                        <button
                          key={q.key}
                          onClick={() => sendMessage(label)}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border/60 text-left text-xs text-foreground hover:bg-primary/5 hover:border-primary/30 transition-colors"
                        >
                          <Icon size={14} className="text-primary shrink-0" />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setShowQuickQueries(!showQuickQueries)}
                    className="text-xs text-primary hover:underline px-1"
                  >
                    {showQuickQueries
                      ? (t("chat.show_less") || "Show less")
                      : (t("chat.more_queries") || "More queries...")}
                  </button>
                  {showQuickQueries && (
                    <div className="grid grid-cols-1 gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                      {QUICK_QUERIES.slice(5).map((q) => {
                        const Icon = q.icon;
                        const label = t(q.key) || q.fallback;
                        return (
                          <button
                            key={q.key}
                            onClick={() => sendMessage(label)}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border/60 text-left text-xs text-foreground hover:bg-primary/5 hover:border-primary/30 transition-colors"
                          >
                            <Icon size={14} className="text-primary shrink-0" />
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Message bubbles */}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "bot" && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Flower2 size={14} className="text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  {msg.role === "bot" ? (
                    <RenderMarkdown text={msg.text} />
                  ) : (
                    msg.text
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                    <User size={14} className="text-accent" />
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Flower2 size={14} className="text-primary" />
                </div>
                <div className="bg-muted px-4 py-2.5 rounded-xl rounded-bl-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {t("chat.searching") || "Searching portal data..."}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input area */}
          <form onSubmit={handleSend} className="p-3 border-t bg-card flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("chat.type_message")}
              disabled={loading}
              className="flex-1 border-primary/30 focus-visible:ring-primary"
            />
            <Button
              type="submit"
              disabled={loading || !input.trim()}
              size="icon"
              className="bg-primary hover:bg-primary/90 shrink-0"
            >
              <Send size={16} />
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
