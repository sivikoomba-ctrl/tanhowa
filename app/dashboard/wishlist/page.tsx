"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { Lightbulb, Plus, ArrowBigUp, Search, Sparkles, TrendingUp, User, Mic } from "lucide-react";
import { toast } from "sonner";
import { useT, useLang } from "@/lib/i18n";
import { VoiceCaptureDialog, type VoiceCaptureResult } from "@/components/voice-capture-dialog";

const CATEGORIES = ["Training", "Infrastructure", "Events", "Digital Tools", "Policy", "Welfare", "Communication", "Other"];

interface Idea {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  upvote_count: number;
  user_upvoted: boolean;
  admin_remarks: string;
  linked_task_id: string | null;
  created_at: string;
  submitter?: { name: string; photo_url: string | null };
}

export default function WishlistPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [sortBy, setSortBy] = useState<"votes" | "newest">("votes");
  const [showVoice, setShowVoice] = useState(false);
  const [fromVoice, setFromVoice] = useState(false);
  const t = useT();
  const { lang } = useLang();

  function handleVoiceTranscribed(result: VoiceCaptureResult) {
    setTitle(result.title);
    setDescription(result.description);
    if (result.category) setCategory(result.category);
    setFromVoice(true);
    setShowCreate(true);
  }

  function load() {
    fetch(`/api/wishlist${lang === "ta" ? "?lang=ta" : ""}`)
      .then((r) => r.json())
      .then((d) => setIdeas(d.ideas || []))
      .catch(() => toast.error("Failed to load ideas"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  async function handleCreate() {
    if (!title.trim() || !description.trim()) {
      toast.error(t("wishlist.title_desc_required"));
      return;
    }
    setCreating(true);
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: description.trim(), category }),
    });
    setCreating(false);
    if (res.ok) {
      toast.success(t("wishlist.submitted"));
      setShowCreate(false);
      setTitle("");
      setDescription("");
      setCategory("");
      setFromVoice(false);
      load();
    } else {
      toast.error("Failed to submit idea");
    }
  }

  async function handleVote(ideaId: string, currentlyVoted: boolean) {
    const action = currentlyVoted ? "unvote" : "upvote";
    const res = await fetch("/api/wishlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ideaId, action }),
    });
    if (res.ok) {
      setIdeas((prev) =>
        prev.map((i) =>
          i.id === ideaId
            ? {
                ...i,
                user_upvoted: !currentlyVoted,
                upvote_count: currentlyVoted ? Math.max(0, i.upvote_count - 1) : i.upvote_count + 1,
              }
            : i
        )
      );
    }
  }

  const filtered = useMemo(() => {
    let list = ideas;
    if (activeCategory !== "All") {
      list = list.filter((i) => i.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    if (sortBy === "newest") {
      list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  }, [ideas, activeCategory, searchQuery, sortBy]);

  const topVoted = ideas.length > 0 ? Math.max(...ideas.map((i) => i.upvote_count)) : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lightbulb className="h-6 w-6 text-amber-500" />
            {t("wishlist.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("wishlist.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowVoice(true)} variant="outline" className="border-primary/40 text-primary hover:bg-primary/5">
            <Mic size={16} className="mr-1" /> {t("wishlist.speak_idea")}
          </Button>
          <Button onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90">
            <Plus size={16} className="mr-1" /> {t("wishlist.submit_idea")}
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label={t("wishlist.total_ideas")} value={ideas.length} icon={Lightbulb} borderColor="border-l-amber-500" />
        <MetricCard label={t("wishlist.my_upvotes")} value={ideas.filter((i) => i.user_upvoted).length} icon={ArrowBigUp} borderColor="border-l-primary" />
        <MetricCard label={t("wishlist.top_votes")} value={topVoted} icon={TrendingUp} borderColor="border-l-blue-500" />
      </div>

      {/* Search + Sort */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("wishlist.search")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as "votes" | "newest")}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="votes">{t("wishlist.most_voted")}</SelectItem>
            <SelectItem value="newest">{t("wishlist.newest")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Category pills */}
      <div className="flex gap-2 flex-wrap">
        {["All", ...CATEGORIES].map((cat) => (
          <Badge
            key={cat}
            variant={activeCategory === cat ? "default" : "outline"}
            className="cursor-pointer text-sm px-3 py-1"
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
            {cat !== "All" && <span className="ml-1 opacity-60">({ideas.filter((i) => i.category === cat).length})</span>}
          </Badge>
        ))}
      </div>

      {/* Ideas List */}
      {filtered.length === 0 ? (
        <EmptyState icon={Lightbulb} title={t("wishlist.no_ideas")} description={t("wishlist.no_ideas_desc")} />
      ) : (
        <div className="space-y-3">
          {filtered.map((idea) => (
            <Card key={idea.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4 pb-4">
                <div className="flex gap-3">
                  {/* Upvote button */}
                  <button
                    onClick={() => handleVote(idea.id, idea.user_upvoted)}
                    className={`flex flex-col items-center justify-center w-14 shrink-0 rounded-xl border-2 py-2 transition-colors ${
                      idea.user_upvoted
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-gray-200 text-gray-400 hover:border-primary/50 hover:text-primary"
                    }`}
                  >
                    <ArrowBigUp size={22} className={idea.user_upvoted ? "fill-current" : ""} />
                    <span className="text-sm font-bold">{idea.upvote_count}</span>
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm">{idea.title}</h3>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {idea.category && <Badge variant="outline" className="text-[10px]">{idea.category}</Badge>}
                        <StatusBadge status={idea.status} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{idea.description}</p>
                    {idea.admin_remarks && (
                      <div className="mt-2 rounded-lg bg-primary/5 border border-primary/10 p-2">
                        <p className="text-xs text-primary"><span className="font-semibold">Admin:</span> {idea.admin_remarks}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      {idea.submitter?.name && (
                        <span className="flex items-center gap-1"><User size={10} /> {idea.submitter.name}</span>
                      )}
                      <span>{new Date(idea.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                      {idea.linked_task_id && (
                        <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                          <Sparkles size={10} className="mr-0.5" /> Converted to Task
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Idea Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) setFromVoice(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("wishlist.new_idea")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {fromVoice && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 flex items-start gap-2">
                <Sparkles size={14} className="text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-primary leading-relaxed">{t("wishlist.review_hint")}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("wishlist.idea_title")} *</Label>
              <Input placeholder={t("wishlist.idea_title_ph")} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("wishlist.idea_desc")} *</Label>
              <Textarea placeholder={t("wishlist.idea_desc_ph")} value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            </div>
            <div className="space-y-2">
              <Label>{t("wishlist.category")}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder={t("wishlist.select_category")} /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={creating} className="w-full bg-primary hover:bg-primary/90">
              {creating ? t("wishlist.submitting") : t("wishlist.submit_idea")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <VoiceCaptureDialog open={showVoice} onOpenChange={setShowVoice} onTranscribed={handleVoiceTranscribed} />
    </div>
  );
}
