"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageCircle, Send, X, Flower2, User, Database,
  Megaphone, CalendarDays, Users, FileText, Trophy,
  ClipboardList, GraduationCap, BarChart3, CreditCard,
  Sparkles, RotateCcw, Paperclip, CheckCircle2, AlertCircle,
} from "lucide-react";
import { useT } from "@/lib/i18n";

interface Sub {
  id: string;
  period: string;
  amount: number;
  status: string;
}

interface Message {
  role: "user" | "bot";
  text: string;
  subSelect?: Sub[]; // renders inline subscription selection buttons
}

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
    const parts = str.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
      return part;
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (bulletMatch) { if (listType === "ol") flushList(); listType = "ul"; listItems.push(bulletMatch[1]); continue; }
    const numMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (numMatch) { if (listType === "ul") flushList(); listType = "ol"; listItems.push(numMatch[1]); continue; }
    flushList();
    if (trimmed === "") elements.push(<br key={elements.length} />);
    else if (trimmed.startsWith("### ")) elements.push(<p key={elements.length} className="font-semibold text-xs mt-1.5 mb-0.5">{formatInline(trimmed.slice(4))}</p>);
    else if (trimmed.startsWith("## ")) elements.push(<p key={elements.length} className="font-bold text-sm mt-2 mb-0.5">{formatInline(trimmed.slice(3))}</p>);
    else elements.push(<p key={elements.length} className="my-0.5">{formatInline(trimmed)}</p>);
  }
  flushList();
  return <div className="space-y-0">{elements}</div>;
}

const PROOF_KEYWORDS = /\b(upload|proof|payment proof|paid|receipt|screenshot|upi|neft|transfer)\b/i;

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQuickQueries, setShowQuickQueries] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [userName, setUserName] = useState("");
  const [pendingSubs, setPendingSubs] = useState<Sub[]>([]);
  const [uploadTargetSub, setUploadTargetSub] = useState<Sub | null>(null);
  const [uploading, setUploading] = useState(false);
  const greeted = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.user || data.user.status !== "approved") { setAllowed(false); return; }
        const u = data.user;
        setUserName(u.name?.split(" ")[0] || u.name || "");
        setAllowed(true);
      })
      .catch(() => setAllowed(false));

    fetch("/api/subscriptions?me=true")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const subs: Sub[] = (data?.subscriptions || []).filter(
          (s: Sub) => s.status === "pending" || s.status === "overdue"
        );
        setPendingSubs(subs);
      })
      .catch(() => {});
  }, []);

  // Auto-greet once when chat opens
  useEffect(() => {
    if (!open || greeted.current || !allowed) return;
    greeted.current = true;

    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const name = userName || "there";

    let text = `${timeGreeting}, **${name}**! 🌺 I'm your TANHOWA Assistant.\n\n`;

    if (pendingSubs.length > 0) {
      text += `You have **${pendingSubs.length} pending payment${pendingSubs.length > 1 ? "s" : ""}**:\n`;
      pendingSubs.forEach((s) => {
        text += `- **${s.period}** — ₹${s.amount.toLocaleString("en-IN")} (${s.status})\n`;
      });
      text += `\nTap 📎 below to upload a payment proof, or ask me anything!`;
    } else {
      text += `How can I help you today? Ask me about announcements, events, your tasks, and more.`;
    }

    setMessages([{ role: "bot", text }]);
  }, [open, allowed, userName, pendingSubs]);

  const addBotMessage = useCallback((text: string, extra?: Partial<Message>) => {
    setMessages((prev) => [...prev, { role: "bot", text, ...extra }]);
  }, []);

  // Start proof upload — show sub-selection if multiple pending, else go straight to file picker
  function startProofUpload() {
    if (pendingSubs.length === 0) {
      addBotMessage("You don't have any pending subscriptions to upload proof for. ✅");
      return;
    }
    if (pendingSubs.length === 1) {
      setUploadTargetSub(pendingSubs[0]);
      setTimeout(() => proofInputRef.current?.click(), 50);
      addBotMessage(`Opening file picker for **${pendingSubs[0].period}** (₹${pendingSubs[0].amount.toLocaleString("en-IN")})…`);
    } else {
      addBotMessage("Which subscription are you uploading proof for?", { subSelect: pendingSubs });
    }
  }

  function selectSubForUpload(sub: Sub) {
    setUploadTargetSub(sub);
    addBotMessage(`Got it — uploading proof for **${sub.period}**. Please select your payment screenshot or receipt.`);
    setTimeout(() => proofInputRef.current?.click(), 50);
  }

  async function handleProofFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadTargetSub) return;
    setUploading(true);
    addBotMessage(`Uploading proof for **${uploadTargetSub.period}**…`);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("subscription_id", uploadTargetSub.id);

    try {
      const res = await fetch("/api/upload/payment-proof", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        addBotMessage(`✅ Payment proof uploaded successfully for **${uploadTargetSub.period}**!\n\nYour proof has been submitted. The admin team will verify it shortly. You can check your subscription status anytime by asking "What's my subscription status?"`);
        // Remove this sub from pending list
        setPendingSubs((prev) => prev.filter((s) => s.id !== uploadTargetSub!.id));
      } else {
        addBotMessage(`❌ Upload failed: ${data.error || "Please try again."}`);
      }
    } catch {
      addBotMessage("❌ Upload failed. Please check your connection and try again.");
    }

    setUploading(false);
    setUploadTargetSub(null);
    if (proofInputRef.current) proofInputRef.current.value = "";
  }

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    // Intercept proof upload intent locally
    if (PROOF_KEYWORDS.test(text) && pendingSubs.length > 0) {
      setMessages((prev) => [...prev, { role: "user", text: text.trim() }]);
      setInput("");
      startProofUpload();
      return;
    }

    const userMsg: Message = { role: "user", text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowQuickQueries(false);
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role === "user" ? "user" : "model", text: m.text }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
      });
      const data = await res.json();
      if (res.ok && data.reply) {
        setMessages((prev) => [...prev, { role: "bot", text: data.reply }]);
      } else {
        setMessages((prev) => [...prev, { role: "bot", text: data.error || t("chat.error") }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "bot", text: t("chat.unable_connect") }]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, messages, pendingSubs, t]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  if (allowed !== true) return null;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    await sendMessage(input);
  }

  function handleClose() { setOpen(false); }
  function handleReset() { setMessages([]); setInput(""); setShowQuickQueries(false); greeted.current = false; }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 flex items-center justify-center"
          aria-label="Open TANHOWA Assistant"
        >
          <MessageCircle size={24} />
          {pendingSubs.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full border-2 border-background text-[10px] text-white font-bold flex items-center justify-center">
              {pendingSubs.length}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[92vw] sm:w-[420px] h-[85vh] max-h-[680px] rounded-2xl shadow-2xl border bg-background flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-primary text-primary-foreground flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Flower2 size={20} />
              <div>
                <p className="font-semibold text-sm leading-none">{t("chat.title")}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Database size={10} className="text-primary-foreground/60" />
                  <p className="text-[10px] text-primary-foreground/70">Live portal data</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={handleReset} className="text-primary-foreground/60 hover:text-primary-foreground p-1 rounded hover:bg-white/10 transition-colors" title="New conversation">
                  <RotateCcw size={15} />
                </button>
              )}
              <button onClick={handleClose} className="text-primary-foreground/80 hover:text-primary-foreground p-1">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
            {messages.length === 0 && (
              <div className="py-4">
                <div className="text-center mb-5">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                    <Sparkles size={28} className="text-primary" />
                  </div>
                  <p className="text-sm font-medium">{t("chat.hello")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("chat.ask_data") || "Ask me anything about the portal."}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground px-1">{t("chat.try_asking") || "Try asking:"}</p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {QUICK_QUERIES.slice(0, 5).map((q) => {
                      const Icon = q.icon;
                      const label = t(q.key) || q.fallback;
                      return (
                        <button key={q.key} onClick={() => sendMessage(label)} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border/60 text-left text-xs text-foreground hover:bg-primary/5 hover:border-primary/30 transition-colors">
                          <Icon size={14} className="text-primary shrink-0" />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => setShowQuickQueries(!showQuickQueries)} className="text-xs text-primary hover:underline px-1">
                    {showQuickQueries ? (t("chat.show_less") || "Show less") : (t("chat.more_queries") || "More queries...")}
                  </button>
                  {showQuickQueries && (
                    <div className="grid grid-cols-1 gap-1.5">
                      {QUICK_QUERIES.slice(5).map((q) => {
                        const Icon = q.icon;
                        const label = t(q.key) || q.fallback;
                        return (
                          <button key={q.key} onClick={() => sendMessage(label)} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border/60 text-left text-xs text-foreground hover:bg-primary/5 hover:border-primary/30 transition-colors">
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

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "bot" && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Flower2 size={14} className="text-primary" />
                  </div>
                )}
                <div className={`max-w-[82%] space-y-2`}>
                  <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                    {msg.role === "bot" ? <RenderMarkdown text={msg.text} /> : msg.text}
                  </div>
                  {/* Sub-selection buttons */}
                  {msg.subSelect && msg.subSelect.length > 0 && (
                    <div className="space-y-1.5 ml-1">
                      {msg.subSelect.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => selectSubForUpload(s)}
                          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-xs text-left transition-colors"
                        >
                          <CreditCard size={12} className="text-primary shrink-0" />
                          <span className="font-medium">{s.period}</span>
                          <span className="text-muted-foreground ml-auto">₹{s.amount.toLocaleString("en-IN")}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${s.status === "overdue" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{s.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                    <User size={14} className="text-accent" />
                  </div>
                )}
              </div>
            ))}

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
                    <span className="text-xs text-muted-foreground">{t("chat.searching") || "Searching portal data..."}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Upload proof shortcut strip (shown when there are pending subs) */}
          {pendingSubs.length > 0 && (
            <div className="px-3 py-1.5 border-t bg-amber-50 flex items-center gap-2 shrink-0">
              <AlertCircle size={13} className="text-amber-600 shrink-0" />
              <p className="text-[11px] text-amber-700 flex-1">
                {pendingSubs.length} pending payment{pendingSubs.length > 1 ? "s" : ""}
              </p>
              <button
                onClick={startProofUpload}
                disabled={uploading}
                className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
              >
                <Paperclip size={11} />
                Upload proof
              </button>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSend} className="p-3 border-t bg-card flex gap-2 shrink-0">
            <button
              type="button"
              onClick={startProofUpload}
              disabled={uploading}
              title="Upload payment proof"
              className="text-muted-foreground hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-primary/5 shrink-0"
            >
              {uploading ? <CheckCircle2 size={18} className="text-green-500 animate-pulse" /> : <Paperclip size={18} />}
            </button>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("chat.type_message")}
              disabled={loading || uploading}
              className="flex-1 border-primary/30 focus-visible:ring-primary"
            />
            <Button type="submit" disabled={loading || uploading || !input.trim()} size="icon" className="bg-primary hover:bg-primary/90 shrink-0">
              <Send size={16} />
            </Button>
          </form>

          {/* Hidden file input */}
          <input ref={proofInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleProofFile} />
        </div>
      )}
    </>
  );
}
