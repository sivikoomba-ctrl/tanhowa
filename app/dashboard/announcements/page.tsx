"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Megaphone, Plus, Clock, UserPlus, CheckCheck, Search, Calendar } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { useT, useLang } from "@/lib/i18n";

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// Allowlist for inline images — only profile-photo CDNs the project already trusts.
function isSafeImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    return (
      h.endsWith(".supabase.co") ||
      h.endsWith(".fbcdn.net") ||
      h === "platform-lookaside.fbsbx.com" ||
      h.endsWith(".googleusercontent.com")
    );
  } catch {
    return false;
  }
}

function renderSimpleMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // Image syntax ![alt](url) — must run BEFORE link syntax so ! prefix is consumed
    .replace(/!\[([^\]]*)\]\((https:\/\/[^\s)"'<>]+)\)/g, (_m, alt: string, url: string) => {
      if (!isSafeImageUrl(url)) return "";
      const safeAlt = alt.replace(/"/g, "&quot;");
      return `<img src="${url}" alt="${safeAlt}" class="inline-block w-8 h-8 rounded-full object-cover align-middle mx-1 ring-1 ring-border" />`;
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>')
    .replace(/(https?:\/\/[^\s<]+)/g, (match, url) => {
      if (match.includes('href="')) return match;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${url}</a>`;
    });
}

interface RecentMember {
  name: string;
  created_at: string;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  users?: { name: string };
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [recentMembers, setRecentMembers] = useState<RecentMember[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const t = useT();
  const { lang } = useLang();

  const markAsRead = useCallback((id: string) => {
    if (readIds.has(id)) return;
    setReadIds((prev) => new Set(prev).add(id));
    fetch("/api/announcements/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcement_id: id }),
    }).catch(() => {});
  }, [readIds]);

  function loadAnnouncements() {
    fetch(`/api/announcements${lang === "ta" ? "?lang=ta" : ""}`)
      .then((r) => r.json())
      .then((d) => setAnnouncements(d.announcements || []))
      .catch(() => toast.error("Failed to load announcements"));
  }

  useEffect(() => {
    loadAnnouncements();
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          const r = d.user.role;
          const o = d.user.official_type;
          if (r === "admin" || r === "super_admin" || o === "state" || o === "district") {
            setCanCreate(true);
          }
        }
      })
      .catch(() => {});
    fetch("/api/announcements/read")
      .then((r) => r.json())
      .then((d) => setReadIds(new Set(d.readIds || [])))
      .catch(() => {});
    fetch("/api/users/recent")
      .then((r) => r.json())
      .then((d) => setRecentMembers(d.members || []))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  async function handleCreate() {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setCreating(true);
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), content: content.trim(), published: true }),
    });
    setCreating(false);
    if (res.ok) {
      toast.success("Announcement published");
      setShowCreate(false);
      setTitle("");
      setContent("");
      loadAnnouncements();
    } else {
      toast.error("Failed to create announcement");
    }
  }

  // Group by month/year
  function groupByMonth(items: Announcement[]) {
    const groups: Record<string, Announcement[]> = {};
    items.forEach((a) => {
      const d = new Date(a.created_at);
      const key = `${d.toLocaleDateString("en", { month: "long" })} ${d.getFullYear()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    return Object.entries(groups);
  }

  const filteredAnnouncements = announcements.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return a.title.toLowerCase().includes(q) || a.content?.toLowerCase().includes(q) || a.users?.name?.toLowerCase().includes(q);
  });
  const grouped = groupByMonth(filteredAnnouncements);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("announce.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("announce.subtitle")}</p>
          {announcements.length > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {filteredAnnouncements.length !== announcements.length
                ? t("announce.filtered_count", { filtered: String(filteredAnnouncements.length), total: String(announcements.length) })
                : t("announce.count", { count: String(announcements.length) })}
            </p>
          )}
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90">
            <Plus size={16} className="mr-1" />{t("announce.new")}
          </Button>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("announce.new_announcement")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder={t("announce.title_placeholder")} value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder={t("announce.content_placeholder")} value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
            <Button onClick={handleCreate} disabled={creating} className="w-full bg-primary hover:bg-primary/90">
              {creating ? t("announce.publishing") : t("announce.publish")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search */}
      {announcements.length > 3 && (
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("announce.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* New Members Ticker */}
      {recentMembers.length > 0 && (
        <div className="rounded-xl border bg-primary/5 border-primary/20 overflow-hidden w-full">
          <div className="flex items-center min-w-0">
            <div className="bg-primary text-white px-3 py-2 text-xs font-semibold shrink-0 flex items-center gap-1.5">
              <UserPlus size={14} />
              {t("announce.new_members")}
            </div>
            <div className="flex-1 overflow-hidden relative py-2 min-w-0">
              <div
                className="flex gap-8 whitespace-nowrap px-4"
                style={{
                  animation: `scroll ${Math.max(recentMembers.length * 5, 15)}s linear infinite`,
                }}
              >
                {[...recentMembers, ...recentMembers].map((m, i) => (
                  <span key={i} className="text-xs text-primary inline-flex items-center gap-1.5 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    {t("announce.welcome")} <span className="font-semibold uppercase">{m.name}</span>!
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {announcements.length === 0 ? (
        <EmptyState icon={Megaphone} title={t("announce.no_announcements")} description={t("announce.check_back")} />
      ) : (
        <div className="space-y-8">
          {grouped.map(([month, items]) => (
            <div key={month}>
              <div className="flex items-center gap-3 mb-4">
                <Badge variant="outline" className="text-xs font-medium bg-muted/50 px-3 py-1">{month}</Badge>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-4">
                {items.map((a, index) => {
                  const date = new Date(a.created_at);
                  const isLatest = index === 0 && month === grouped[0][0];
                  return (
                    <Card key={a.id} className={`transition-all hover:shadow-md ${isLatest ? "border-primary/30 bg-primary/[0.02]" : ""}`} onClick={() => markAsRead(a.id)}>
                      <CardContent className="pt-5 pb-5">
                        <div className="flex gap-4">
                          {/* Date column */}
                          <div className="flex-shrink-0 w-14 text-center">
                            <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center ${isLatest ? "bg-primary/10" : "bg-muted/50"}`}>
                              <span className={`text-[10px] font-medium uppercase ${isLatest ? "text-primary" : "text-muted-foreground"}`}>
                                {date.toLocaleDateString("en", { month: "short" })}
                              </span>
                              <span className={`text-xl font-bold leading-none ${isLatest ? "text-primary" : "text-foreground"}`}>
                                {date.getDate()}
                              </span>
                            </div>
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h2 className="text-base font-semibold leading-snug">{a.title}</h2>
                              {isLatest && <Badge className="bg-primary/10 text-primary border-0 text-[10px] shrink-0">{t("announce.new_badge")}</Badge>}
                            </div>
                            {a.content && (
                              <div className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(a.content) }} />
                            )}
                            <div className="flex items-center gap-3 mt-3 flex-wrap">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground" title={date.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })}>
                                <Calendar size={11} />
                                {date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock size={11} />
                                {date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                              </div>
                              <span className="text-[10px] text-muted-foreground/70">{timeAgo(a.created_at)}</span>
                              {a.users?.name && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Avatar className="w-4 h-4">
                                    <AvatarFallback className="bg-primary/10 text-primary text-[8px]">
                                      {a.users.name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  {a.users.name}
                                </div>
                              )}
                              {readIds.has(a.id) && (
                                <span className="flex items-center gap-0.5 text-[10px] text-blue-500">
                                  <CheckCheck size={11} /> {t("announce.read")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
