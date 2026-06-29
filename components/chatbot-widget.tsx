"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageCircle, Send, X, Flower2, User, Database,
  Megaphone, CalendarDays, Users, FileText, Trophy,
  ClipboardList, GraduationCap, BarChart3, CreditCard,
  Sparkles, RotateCcw, Paperclip, CheckCircle2, AlertCircle, Mic, Volume2, VolumeX, Receipt, ImageUp,
} from "lucide-react";
import { toast } from "sonner";
import { useT, useLang } from "@/lib/i18n";
import { usePathname } from "next/navigation";

interface Sub {
  id: string;
  period: string;
  amount: number;
  status: string;
  payment_proof_url?: string | null;
}

interface Message {
  role: "user" | "bot";
  text: string;
  subSelect?: Sub[]; // renders inline subscription selection buttons
  attachChoice?: boolean; // renders "what's this file for?" buttons
  image?: string; // data URL of a user-attached image, rendered as a thumbnail
}

// Leading honorifics to drop so the greeting uses the real first name, not "Mr."
const HONORIFICS = new Set([
  "mr", "mrs", "ms", "miss", "dr", "prof", "er", "smt",
  "thiru", "tmt", "selvi", "thirumathi", "திரு", "திருமதி", "செல்வி", "மருத்துவர்",
  // "sri"/"shri" excluded — name components (e.g. "Srividhya") more often than honorifics.
]);

function firstName(full?: string): string {
  if (!full) return "";
  const parts = full.trim().split(/\s+/);
  while (parts.length && HONORIFICS.has(parts[0].replace(/\.$/, "").toLowerCase())) {
    parts.shift();
  }
  return parts[0] || "";
}

const QUICK_QUERIES = [
  { icon: Sparkles, key: "chat.q_help", fallback: "What can I do here?" },
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

// Only treat a message as an upload intent when the user clearly wants to upload —
// NOT when they're just asking a question that happens to contain "paid"/"payment"
// (e.g. "how much did Suresh pay?"). Bare "paid/upi/transfer" no longer triggers it.
const PROOF_INTENT = /\b(upload|attach)\b|\bpayment proof\b|\bproof of payment\b|\bi(?:'ve| have)? paid\b|\bsubmit (?:my )?(?:payment|proof|receipt)\b/i;
const QUESTION_RX = /\?|^\s*(how|what|who|whom|whose|when|where|why|which|whether|is|are|am|do|does|did|can|could|would|should|has|have|had|show|list|tell|find|search)\b/i;

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [fabHidden, setFabHidden] = useState(false);
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
  const autoOpened = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; base64: string; mimeType: string } | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [ttsOn, setTtsOn] = useState(false);
  const lastSpokenRef = useRef(-1);
  const t = useT();
  const { lang } = useLang();
  const pathname = usePathname();
  // The assistant is a member feature tied to personal portal data — only mount
  // it inside the authenticated app, never on the public landing / auth pages
  // (otherwise it shows the last user's data after logout). See logout bug fix.
  const onAppRoute = !!pathname && (pathname.startsWith("/dashboard") || pathname.startsWith("/admin"));

  useEffect(() => {
    if (!onAppRoute) { setAllowed(false); return; }
    fetch("/api/users/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.user || data.user.status !== "approved") { setAllowed(false); return; }
        const u = data.user;
        setUserName(firstName(u.name));
        setAllowed(true);
      })
      .catch(() => setAllowed(false));

    fetch("/api/subscriptions?me=true")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const subs: Sub[] = (data?.subscriptions || []).filter(
          // Pending/overdue AND no proof yet — once a proof is submitted it's awaiting
          // verification, so don't nag the member about it as "pending".
          (s: Sub) => (s.status === "pending" || s.status === "overdue") && !(s.payment_proof_url && s.payment_proof_url !== "")
        );
        setPendingSubs(subs);
      })
      .catch(() => {});
  }, [onAppRoute]);

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

  // Auto-open once when an approved user enters the site — unless they've
  // already dismissed it this session (so it doesn't re-pop on every nav).
  useEffect(() => {
    if (autoOpened.current || allowed !== true) return;
    autoOpened.current = true;
    try {
      if (sessionStorage.getItem("tanhowa-assistant-fab-hidden") === "1") { setFabHidden(true); return; }
      if (sessionStorage.getItem("tanhowa-assistant-dismissed") === "1") return;
    } catch { /* sessionStorage unavailable — open anyway */ }
    setOpen(true);
  }, [allowed]);

  // Hide the floating button for this session (returns next login).
  function hideFab() {
    setOpen(false);
    setFabHidden(true);
    try { sessionStorage.setItem("tanhowa-assistant-fab-hidden", "1"); } catch { /* ignore */ }
  }

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

  // 📎 button — ask what the file is for, then route accordingly.
  function openAttachMenu() {
    addBotMessage("What would you like to attach?", { attachChoice: true });
  }

  function chooseAttach(kind: "proof" | "voucher" | "assistant") {
    if (kind === "proof") { startProofUpload(); return; }
    if (kind === "voucher") {
      addBotMessage("Opening **Expense Vouchers** — tap *Create Voucher*, then *Scan bill* to attach and auto-read your bill. 🧾");
      setTimeout(() => { window.location.href = "/dashboard/vouchers"; }, 700);
      return;
    }
    // assistant: pick any image to ask about
    setTimeout(() => attachInputRef.current?.click(), 50);
  }

  async function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (attachInputRef.current) attachInputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      addBotMessage("Please pick an image — a photo of a pest, plant, document, or receipt.");
      return;
    }
    if (file.size > 6_000_000) {
      addBotMessage("That image is a bit large — please choose one under 6 MB.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    setPendingImage({ dataUrl, base64: dataUrl.split(",")[1] || "", mimeType: file.type });
    addBotMessage('Got your image 📎 — now type what you\'d like me to do with it (e.g., "what pest is this?", "summarize this document").');
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
    if ((!text.trim() && !pendingImage) || loading) return;

    // Intercept proof upload intent locally — but never hijack a question or an image attachment
    if (!pendingImage && PROOF_INTENT.test(text) && !QUESTION_RX.test(text) && pendingSubs.length > 0) {
      setMessages((prev) => [...prev, { role: "user", text: text.trim() }]);
      setInput("");
      startProofUpload();
      return;
    }

    const img = pendingImage;
    const userMsg: Message = { role: "user", text: text.trim() || "(image attached)", ...(img ? { image: img.dataUrl } : {}) };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPendingImage(null);
    setShowQuickQueries(false);
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role === "user" ? "user" : "model", text: m.text }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim() || "Please look at this image and help me.",
          history,
          image: img ? { data: img.base64, mimeType: img.mimeType } : undefined,
        }),
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
  }, [loading, messages, pendingSubs, pendingImage, t]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // Restore the spoken-replies preference once
  useEffect(() => {
    try { if (localStorage.getItem("tanhowa-assistant-tts") === "1") setTtsOn(true); } catch {}
  }, []);

  // Speak each new bot reply when spoken replies are on (skip while still loading)
  useEffect(() => {
    if (!ttsOn || loading || messages.length === 0) return;
    const idx = messages.length - 1;
    if (idx <= lastSpokenRef.current) return;
    const last = messages[idx];
    if (last.role === "bot") { speak(last.text); lastSpokenRef.current = idx; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, ttsOn, loading]);

  if (allowed !== true || !onAppRoute) return null;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    await sendMessage(input);
  }

  // Voice command: speech-to-text into the chat, then auto-send on completion.
  async function toggleVoice() {
    if (listening) { recognitionRef.current?.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error("Voice input needs Chrome or a supported browser."); return; }

    // Pre-request mic permission so the browser shows its standard prompt.
    // Android Chrome and the installed PWA otherwise fail silently with
    // "not-allowed" because SpeechRecognition never prompts on its own.
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop()); // release; recognition opens its own
      } catch {
        toast.error("Mic blocked. Allow microphone for tanhowa.in: browser ⋮ → Site settings → Microphone (or phone Settings → Apps → TANHOWA → Permissions), then try again.");
        return;
      }
    }

    const recognition = new SR();
    recognition.lang = lang === "ta" ? "ta-IN" : "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalText = "";
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setInput(finalText || interim);
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture") {
        toast.error("Mic blocked. Allow microphone for tanhowa.in: browser ⋮ → Site settings → Microphone (or phone Settings → Apps → TANHOWA → Permissions), then try again.");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        toast.error("Voice input didn't work — please try again.");
      }
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      const text = finalText.trim();
      if (text) { setInput(""); sendMessage(text); }
    };

    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); } catch { setListening(false); }
  }

  // Spoken replies (text-to-speech). Strip markdown/emoji before speaking.
  function speak(raw: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const clean = raw
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/[*_#>`]/g, "")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/\n+/g, ". ")
      .trim();
    if (!clean) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = lang === "ta" ? "ta-IN" : "en-IN";
    window.speechSynthesis.speak(u);
  }

  function toggleTts() {
    const next = !ttsOn;
    setTtsOn(next);
    try { localStorage.setItem("tanhowa-assistant-tts", next ? "1" : "0"); } catch {}
    if (!next && typeof window !== "undefined") window.speechSynthesis?.cancel();
    else if (next) {
      // Speak the most recent bot reply immediately on enable
      const lastBot = [...messages].reverse().find((m) => m.role === "bot");
      if (lastBot) { speak(lastBot.text); lastSpokenRef.current = messages.length - 1; }
    }
  }

  function handleClose() {
    setOpen(false);
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    // Remember dismissal so the assistant doesn't auto-reopen this session.
    try { sessionStorage.setItem("tanhowa-assistant-dismissed", "1"); } catch { /* ignore */ }
  }
  function handleReset() { setMessages([]); setInput(""); setShowQuickQueries(false); greeted.current = false; }

  return (
    <>
      {!open && !fabHidden && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={() => setOpen(true)}
            className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 flex items-center justify-center"
            aria-label="Open TANHOWA Assistant"
          >
            <MessageCircle size={24} />
            {pendingSubs.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full border-2 border-background text-[10px] text-white font-bold flex items-center justify-center">
                {pendingSubs.length}
              </span>
            )}
          </button>
          <button
            onClick={hideFab}
            className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-muted text-muted-foreground border border-border shadow flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
            aria-label="Hide assistant for now"
            title="Hide for now"
          >
            <X size={12} />
          </button>
        </div>
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
              <button onClick={toggleTts} className="text-primary-foreground/60 hover:text-primary-foreground p-1 rounded hover:bg-white/10 transition-colors" title={ttsOn ? "Spoken replies on" : "Spoken replies off"}>
                {ttsOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
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
                  {msg.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={msg.image} alt="attachment" className="rounded-lg max-h-40 border border-primary/20 ml-auto" />
                  )}
                  <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                    {msg.role === "bot" ? <RenderMarkdown text={msg.text} /> : msg.text}
                  </div>
                  {/* Attach chooser buttons */}
                  {msg.attachChoice && (
                    <div className="space-y-1.5 ml-1">
                      <button onClick={() => chooseAttach("proof")} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-xs text-left transition-colors">
                        <CreditCard size={13} className="text-primary shrink-0" />
                        <span className="font-medium">Payment proof</span>
                        <span className="text-muted-foreground ml-auto text-[10px]">for a pending subscription</span>
                      </button>
                      <button onClick={() => chooseAttach("voucher")} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-xs text-left transition-colors">
                        <Receipt size={13} className="text-primary shrink-0" />
                        <span className="font-medium">Expense bill</span>
                        <span className="text-muted-foreground ml-auto text-[10px]">create a voucher</span>
                      </button>
                      <button onClick={() => chooseAttach("assistant")} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-xs text-left transition-colors">
                        <ImageUp size={13} className="text-primary shrink-0" />
                        <span className="font-medium">Show the assistant</span>
                        <span className="text-muted-foreground ml-auto text-[10px]">ask about an image</span>
                      </button>
                    </div>
                  )}
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

          {/* Attached-image strip */}
          {pendingImage && (
            <div className="px-3 py-1.5 border-t bg-primary/5 flex items-center gap-2 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingImage.dataUrl} alt="" className="h-8 w-8 rounded object-cover border" />
              <span className="text-[11px] text-muted-foreground flex-1">Image attached — type your question.</span>
              <button onClick={() => setPendingImage(null)} className="text-[11px] text-red-600 hover:underline">Remove</button>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSend} className="p-3 border-t bg-card flex gap-2 shrink-0">
            <button
              type="button"
              onClick={openAttachMenu}
              disabled={uploading}
              title="Attach a file"
              className="text-muted-foreground hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-primary/5 shrink-0"
            >
              {uploading ? <CheckCircle2 size={18} className="text-green-500 animate-pulse" /> : <Paperclip size={18} />}
            </button>
            <button
              type="button"
              onClick={toggleVoice}
              disabled={loading || uploading}
              title={listening ? "Stop listening" : "Speak your message"}
              className={`p-1.5 rounded-lg shrink-0 transition-colors ${listening ? "text-red-500 bg-red-50 animate-pulse" : "text-muted-foreground hover:text-primary hover:bg-primary/5"}`}
            >
              <Mic size={18} />
            </button>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? "Listening…" : t("chat.type_message")}
              disabled={loading || uploading}
              className="flex-1 border-primary/30 focus-visible:ring-primary"
            />
            <Button type="submit" disabled={loading || uploading || (!input.trim() && !pendingImage)} size="icon" className="bg-primary hover:bg-primary/90 shrink-0">
              <Send size={16} />
            </Button>
          </form>

          {/* Hidden file inputs */}
          <input ref={proofInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleProofFile} />
          <input ref={attachInputRef} type="file" accept="image/*" className="hidden" onChange={handleAttachFile} />
        </div>
      )}
    </>
  );
}
