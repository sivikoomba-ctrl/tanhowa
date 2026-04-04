"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3, Plus, X, Users } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { useT } from "@/lib/i18n";

interface Poll {
  id: string;
  title: string;
  options: string[];
  status: string;
  created_at: string;
  expires_at: string | null;
  users?: { name: string };
  voteCounts: Record<number, number>;
  totalVotes: number;
  myVote: number | null;
}

export default function PollsPage() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newOptions, setNewOptions] = useState(["", ""]);
  const [creating, setCreating] = useState(false);
  const t = useT();

  function load() {
    fetch("/api/polls")
      .then((r) => r.json())
      .then((d) => setPolls(d.polls || []))
      .catch(() => toast.error("Failed to load polls"));
  }

  useEffect(() => {
    load();
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          const r = d.user.role;
          const o = d.user.official_type;
          if (r === "admin" || r === "super_admin" || o === "state" || o === "district") setCanCreate(true);
        }
      })
      .catch(() => {});
  }, []);

  async function handleCreate() {
    const opts = newOptions.map((o) => o.trim()).filter(Boolean);
    if (!newTitle.trim() || opts.length < 2) {
      toast.error("Title and at least 2 options required");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), options: opts }),
    });
    setCreating(false);
    if (res.ok) {
      toast.success("Poll created");
      setShowCreate(false);
      setNewTitle("");
      setNewOptions(["", ""]);
      load();
    } else toast.error("Failed to create");
  }

  async function vote(pollId: string, optionIndex: number) {
    const res = await fetch("/api/polls", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poll_id: pollId, option_index: optionIndex }),
    });
    if (res.ok) {
      setPolls((prev) =>
        prev.map((p) => {
          if (p.id !== pollId) return p;
          const newCounts = { ...p.voteCounts };
          if (p.myVote !== null) newCounts[p.myVote] = Math.max((newCounts[p.myVote] || 1) - 1, 0);
          newCounts[optionIndex] = (newCounts[optionIndex] || 0) + 1;
          return { ...p, myVote: optionIndex, voteCounts: newCounts, totalVotes: p.myVote === null ? p.totalVotes + 1 : p.totalVotes };
        })
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("poll.title")}</h1>
          {polls.length > 0 && <p className="text-sm text-muted-foreground mt-0.5">{polls.length} {t("poll.title").toLowerCase()}</p>}
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90">
            <Plus size={16} className="mr-1" />{t("poll.new_poll")}
          </Button>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("poll.create_poll")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder={`${t("poll.question")} *`} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            {newOptions.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder={`${t("poll.option")} ${i + 1}`}
                  value={opt}
                  onChange={(e) => { const o = [...newOptions]; o[i] = e.target.value; setNewOptions(o); }}
                />
                {newOptions.length > 2 && (
                  <Button variant="ghost" size="sm" onClick={() => setNewOptions(newOptions.filter((_, j) => j !== i))}>
                    <X size={14} />
                  </Button>
                )}
              </div>
            ))}
            {newOptions.length < 6 && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setNewOptions([...newOptions, ""])}>
                <Plus size={14} className="mr-1" /> {t("poll.add_option")}
              </Button>
            )}
            <Button onClick={handleCreate} disabled={creating} className="w-full bg-primary hover:bg-primary/90">
              {creating ? t("poll.creating") : t("poll.create_poll")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {polls.length === 0 ? (
        <EmptyState icon={BarChart3} title={t("poll.no_polls")} description={t("poll.will_appear")} />
      ) : (
        <div className="space-y-4">
          {polls.map((poll) => {
            const hasVoted = poll.myVote !== null;
            const isExpired = poll.expires_at && new Date(poll.expires_at) < new Date();
            const showResults = hasVoted || isExpired || poll.status !== "active";
            return (
              <Card key={poll.id}>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold">{poll.title}</h3>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Users size={10} /> {poll.totalVotes} {poll.totalVotes !== 1 ? t("poll.votes") : t("poll.vote")}
                      </Badge>
                      {poll.status !== "active" && <Badge variant="outline" className="text-[10px] text-red-600">{t("poll.closed")}</Badge>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {poll.options.map((option, i) => {
                      const count = poll.voteCounts[i] || 0;
                      const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0;
                      const isMyVote = poll.myVote === i;
                      return (
                        <button
                          key={i}
                          className={`w-full text-left relative rounded-lg border p-3 transition-colors ${
                            isMyVote ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                          } ${!showResults && poll.status === "active" ? "cursor-pointer" : ""}`}
                          onClick={() => poll.status === "active" && !isExpired && vote(poll.id, i)}
                          disabled={poll.status !== "active" || !!isExpired}
                        >
                          {showResults && (
                            <div
                              className={`absolute inset-0 rounded-lg ${isMyVote ? "bg-primary/10" : "bg-muted/40"}`}
                              style={{ width: `${pct}%` }}
                            />
                          )}
                          <div className="relative flex items-center justify-between">
                            <span className={`text-sm ${isMyVote ? "font-semibold" : ""}`}>
                              {isMyVote && "✓ "}{option}
                            </span>
                            {showResults && (
                              <span className="text-xs text-muted-foreground ml-2">{pct}%</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    by {poll.users?.name || "Admin"} · {new Date(poll.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
