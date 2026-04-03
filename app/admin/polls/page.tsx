"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3, Plus, X, Users, Trash2, Lock, Unlock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";

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

export default function AdminPollsPage() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newOptions, setNewOptions] = useState(["", ""]);
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/polls")
      .then((r) => r.json())
      .then((d) => setPolls(d.polls || []))
      .catch(() => toast.error("Failed to load polls"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

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
      body: JSON.stringify({ title: newTitle.trim(), options: opts, expires_at: newExpiresAt || null }),
    });
    setCreating(false);
    if (res.ok) {
      toast.success("Poll created");
      setShowCreate(false);
      setNewTitle("");
      setNewOptions(["", ""]);
      setNewExpiresAt("");
      load();
    } else toast.error("Failed to create poll");
  }

  async function handleToggleStatus(poll: Poll) {
    const action = poll.status === "active" ? "close" : "reopen";
    setActionLoading(poll.id);
    const res = await fetch("/api/polls", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id: poll.id }),
    });
    setActionLoading(null);
    if (res.ok) {
      toast.success(`Poll ${action === "close" ? "closed" : "reopened"}`);
      load();
    } else toast.error(`Failed to ${action} poll`);
  }

  async function handleDelete(poll: Poll) {
    if (!confirm(`Delete poll "${poll.title}"? This cannot be undone.`)) return;
    setActionLoading(poll.id);
    const res = await fetch(`/api/polls?id=${poll.id}`, { method: "DELETE" });
    setActionLoading(null);
    if (res.ok) { toast.success("Poll deleted"); load(); }
    else toast.error("Failed to delete poll");
  }

  const activePolls = polls.filter((p) => p.status === "active");
  const closedPolls = polls.filter((p) => p.status !== "active");

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Polls</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {polls.length} poll{polls.length !== 1 ? "s" : ""} &middot; {activePolls.length} active
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90">
          <Plus size={16} className="mr-1" /> New Poll
        </Button>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Poll</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Question *" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            {newOptions.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder={`Option ${i + 1}`}
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
                <Plus size={14} className="mr-1" /> Add Option
              </Button>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Expiry date (optional)</label>
              <Input type="datetime-local" value={newExpiresAt} onChange={(e) => setNewExpiresAt(e.target.value)} />
            </div>
            <Button onClick={handleCreate} disabled={creating} className="w-full bg-primary hover:bg-primary/90">
              {creating ? "Creating..." : "Create Poll"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {polls.length === 0 ? (
        <EmptyState icon={BarChart3} title="No polls yet" description="Create a poll to gather member opinions" />
      ) : (
        <>
          {/* Active Polls */}
          {activePolls.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Active</h2>
              {activePolls.map((poll) => (
                <PollCard key={poll.id} poll={poll} actionLoading={actionLoading} onToggle={handleToggleStatus} onDelete={handleDelete} />
              ))}
            </div>
          )}

          {/* Closed Polls */}
          {closedPolls.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Closed</h2>
              {closedPolls.map((poll) => (
                <PollCard key={poll.id} poll={poll} actionLoading={actionLoading} onToggle={handleToggleStatus} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PollCard({ poll, actionLoading, onToggle, onDelete }: {
  poll: Poll;
  actionLoading: string | null;
  onToggle: (p: Poll) => void;
  onDelete: (p: Poll) => void;
}) {
  const isExpired = poll.expires_at && new Date(poll.expires_at) < new Date();
  const isActive = poll.status === "active" && !isExpired;
  const isLoading = actionLoading === poll.id;

  // Find winner(s)
  const maxVotes = Math.max(...Object.values(poll.voteCounts), 0);

  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1">
            <h3 className="font-semibold">{poll.title}</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              by {poll.users?.name || "Admin"} &middot; {new Date(poll.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              {poll.expires_at && (
                <> &middot; Expires {new Date(poll.expires_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-[10px] gap-1">
              <Users size={10} /> {poll.totalVotes}
            </Badge>
            {!isActive && (
              <Badge variant="outline" className="text-[10px] text-red-600 border-red-300">
                {isExpired ? "Expired" : "Closed"}
              </Badge>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="space-y-1.5">
          {poll.options.map((option, i) => {
            const count = poll.voteCounts[i] || 0;
            const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0;
            const isWinner = count > 0 && count === maxVotes && !isActive;
            return (
              <div key={i} className="relative rounded-lg border p-2.5">
                <div
                  className={`absolute inset-0 rounded-lg ${isWinner ? "bg-green-500/15" : "bg-muted/40"}`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between">
                  <span className={`text-sm ${isWinner ? "font-semibold text-green-700" : ""}`}>{option}</span>
                  <span className="text-xs text-muted-foreground ml-2">{count} ({pct}%)</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Admin Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t">
          <Button
            size="sm"
            variant="outline"
            className={`h-7 text-xs gap-1 ${isActive ? "text-amber-700 border-amber-300 hover:bg-amber-50" : "text-green-700 border-green-300 hover:bg-green-50"}`}
            disabled={isLoading}
            onClick={() => onToggle(poll)}
          >
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : isActive ? <Lock size={12} /> : <Unlock size={12} />}
            {isActive ? "Close Poll" : "Reopen"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
            disabled={isLoading}
            onClick={() => onDelete(poll)}
          >
            <Trash2 size={12} /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
