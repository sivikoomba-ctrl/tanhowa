"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Vote, Plus, ThumbsUp, Check, X, Send, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useT, useLang } from "@/lib/i18n";

interface Resolution {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  submitted_by: string;
  vote_count: number;
  votes_required: number;
  total_members: number;
  user_voted: boolean;
  admin_remarks: string;
  voting_opened_at: string | null;
  voting_closed_at: string | null;
  created_at: string;
  submitter?: { name: string };
  approver?: { name: string };
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-700", icon: FileText },
  submitted: { label: "Submitted", color: "bg-amber-100 text-amber-800", icon: Send },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-800", icon: Check },
  voting_open: { label: "Voting Open", color: "bg-purple-100 text-purple-800", icon: Vote },
  passed: { label: "Passed", color: "bg-green-100 text-green-800", icon: Check },
  failed: { label: "Failed", color: "bg-red-100 text-red-800", icon: X },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800", icon: X },
};

export default function ResolutionsPage() {
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [myResolutions, setMyResolutions] = useState<Resolution[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [tab, setTab] = useState("voting");
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [creating, setCreating] = useState(false);
  const [votingIds, setVotingIds] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState("all");
  const t = useT();
  const { lang } = useLang();

  function loadResolutions() {
    fetch(`/api/resolutions${lang === "ta" ? "?lang=ta" : ""}`)
      .then((r) => r.json())
      .then((d) => setResolutions(d.resolutions || []))
      .catch(() => toast.error("Failed to load resolutions"));
  }

  function loadMyResolutions() {
    fetch("/api/resolutions?my=true")
      .then((r) => r.json())
      .then((d) => setMyResolutions(d.resolutions || []))
      .catch(() => {});
  }

  useEffect(() => {
    loadResolutions();
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          const r = d.user.role;
          const o = d.user.official_type;
          // Only super_admin and state officials can create resolutions
          if (r === "super_admin" || o === "state") {
            setCanCreate(true);
            loadMyResolutions();
          }
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const categories = useMemo(() => Array.from(new Set(resolutions.map((r) => r.category).filter(Boolean))).sort(), [resolutions]);
  const filterByCategory = (list: Resolution[]) => categoryFilter === "all" ? list : list.filter((r) => r.category === categoryFilter);
  const votingOpen = useMemo(() => filterByCategory(resolutions.filter((r) => r.status === "voting_open")), [resolutions, categoryFilter]);
  const results = useMemo(() => filterByCategory(resolutions.filter((r) => r.status === "passed" || r.status === "failed")), [resolutions, categoryFilter]);
  const drafts = useMemo(() => myResolutions.filter((r) => r.status === "draft" || r.status === "submitted" || r.status === "approved" || r.status === "rejected"), [myResolutions]);

  async function handleCreate() {
    if (!title.trim() || !description.trim()) { toast.error("Title and description are required"); return; }
    setCreating(true);
    const res = await fetch("/api/resolutions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: description.trim(), category: category.trim() }),
    });
    setCreating(false);
    if (res.ok) {
      toast.success("Resolution created as draft");
      setShowCreate(false);
      setTitle(""); setDescription(""); setCategory("");
      loadMyResolutions();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to create");
    }
  }

  async function handleSubmit(resolutionId: string) {
    const res = await fetch("/api/resolutions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolutionId, action: "submit" }),
    });
    if (res.ok) {
      toast.success("Resolution submitted for approval");
      loadMyResolutions();
    } else {
      toast.error("Failed to submit");
    }
  }

  async function handleVote(resolutionId: string, voted: boolean) {
    setVotingIds((prev) => new Set(prev).add(resolutionId));
    const res = await fetch("/api/resolutions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolutionId, action: voted ? "unvote" : "vote" }),
    });
    setVotingIds((prev) => { const s = new Set(prev); s.delete(resolutionId); return s; });
    if (res.ok) {
      toast.success(voted ? "Vote withdrawn" : "Vote cast!");
      loadResolutions();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to vote");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("resolution.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("resolution.voting")}</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90">
            <Plus size={16} className="mr-1" />{t("resolution.new_resolution")}
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="voting" className="gap-1.5">
            <Vote size={14} />{t("resolution.voting")} ({votingOpen.length})
          </TabsTrigger>
          <TabsTrigger value="results" className="gap-1.5">
            <Check size={14} />{t("resolution.results")} ({results.length})
          </TabsTrigger>
          {canCreate && (
            <TabsTrigger value="my" className="gap-1.5">
              <FileText size={14} />{t("resolution.my_drafts")} ({drafts.length})
            </TabsTrigger>
          )}
        </TabsList>

        {categories.length > 0 && (
          <div className="mt-3">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder={t("resolution.all_categories")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("resolution.all_categories")}</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Voting Open */}
        <TabsContent value="voting" className="mt-4">
          {votingOpen.length === 0 ? (
            <div className="text-center py-12">
              <Vote className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">{t("resolution.no_voting")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {votingOpen.map((r) => (
                <VotingCard key={r.id} resolution={r} onVote={handleVote} voting={votingIds.has(r.id)} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Results */}
        <TabsContent value="results" className="mt-4">
          {results.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">{t("resolution.no_results")}</p>
          ) : (
            <div className="space-y-4">
              {results.map((r) => (
                <ResultCard key={r.id} resolution={r} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* My Resolutions */}
        {canCreate && (
          <TabsContent value="my" className="mt-4">
            {drafts.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">{t("resolution.no_drafts")}</p>
            ) : (
              <div className="space-y-4">
                {drafts.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{r.title}</h3>
                            <StatusBadge status={r.status} />
                          </div>
                          {r.category && <Badge variant="outline" className="text-xs mb-2">{r.category}</Badge>}
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.description}</p>
                          {r.admin_remarks && (
                            <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                              <b>Admin remarks:</b> {r.admin_remarks}
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">Created {formatDate(r.created_at)}</p>
                        </div>
                        {r.status === "draft" && (
                          <Button size="sm" onClick={() => handleSubmit(r.id)} className="bg-primary hover:bg-primary/90">
                            <Send size={14} className="mr-1" />Submit
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("resolution.new_resolution")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Resolution Title *" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Category (optional, e.g. Financial, Welfare, Administrative)" value={category} onChange={(e) => setCategory(e.target.value)} />
            <Textarea
              placeholder="Resolution description / agenda *&#10;&#10;Describe the resolution in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              The resolution will be saved as a draft. Submit it when ready for admin approval.
            </p>
            <Button onClick={handleCreate} disabled={creating} className="w-full bg-primary hover:bg-primary/90">
              {creating ? t("resolution.creating") : t("resolution.create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, color: "bg-gray-100 text-gray-700", icon: FileText };
  return (
    <Badge className={`text-xs ${config.color}`}>
      {config.label}
    </Badge>
  );
}

function VotingCard({ resolution: r, onVote, voting }: { resolution: Resolution; onVote: (id: string, voted: boolean) => void; voting: boolean }) {
  const percentage = r.votes_required > 0 ? Math.min(100, Math.round((r.vote_count / r.votes_required) * 100)) : 0;

  return (
    <Card className="border-l-4 border-l-purple-500">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold">{r.title}</h3>
              {r.category && <Badge variant="outline" className="text-xs">{r.category}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-4">{r.description}</p>

            {/* Vote Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-purple-700">
                  {r.vote_count} / {r.votes_required} votes needed to pass
                </span>
                <span className="text-muted-foreground">{percentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${percentage >= 100 ? "bg-green-500" : "bg-purple-500"}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Total members: {r.total_members} &middot; Majority required: {r.votes_required}
                {r.voting_opened_at && <> &middot; Opened {formatDate(r.voting_opened_at)}</>}
                {r.submitter?.name && <> &middot; by {r.submitter.name}</>}
              </p>
            </div>
          </div>

          <div className="shrink-0">
            {r.user_voted ? (
              <div className="flex flex-col items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onVote(r.id, true)}
                  disabled={voting}
                  className="text-green-700 border-green-300 hover:bg-green-50"
                >
                  <ThumbsUp size={16} className="mr-1 fill-green-600" />
                  Voted
                </Button>
                <button
                  onClick={() => onVote(r.id, true)}
                  disabled={voting}
                  className="text-xs text-muted-foreground hover:text-red-600 transition-colors"
                >
                  Withdraw
                </button>
              </div>
            ) : (
              <Button
                onClick={() => onVote(r.id, false)}
                disabled={voting}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <ThumbsUp size={16} className="mr-1" />
                Vote YES
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultCard({ resolution: r }: { resolution: Resolution }) {
  const passed = r.status === "passed";
  return (
    <Card className={`border-l-4 ${passed ? "border-l-green-500" : "border-l-red-400"}`}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold">{r.title}</h3>
              <StatusBadge status={r.status} />
              {r.category && <Badge variant="outline" className="text-xs">{r.category}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.description}</p>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="font-medium">
                {r.vote_count} / {r.votes_required} votes ({r.total_members} members)
              </span>
              {r.voting_closed_at && <span>Closed {formatDate(r.voting_closed_at)}</span>}
              {r.submitter?.name && <span>by {r.submitter.name}</span>}
            </div>
          </div>
          <div className={`text-3xl font-bold ${passed ? "text-green-600" : "text-red-500"}`}>
            {passed ? "PASSED" : "FAILED"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
