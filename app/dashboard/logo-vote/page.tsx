"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, Vote, MessageSquare, Sparkles, Clock, Trophy, Eye } from "lucide-react";
import { toast } from "sonner";

interface Concept {
  id: string;
  slug: string;
  name: string;
  blurb: string;
  image_url: string;
  votes: number;
}

interface CommentItem {
  id: string;
  concept_id: string | null;
  comment: string;
  created_at: string;
  is_mine: boolean;
  author_name: string;
  author_designation: string;
  author_district: string;
}

interface LogoVoteData {
  concepts: Concept[];
  totalVotes: number;
  myVote: string | null;
  myComment: { id: string; concept_id: string | null; comment: string } | null;
  comments: CommentItem[];
  isOpen: boolean;
  startedAt: string | null;
  endsAt: string | null;
  winnerConceptId: string | null;
}

function formatTimeLeft(endsAt: string | null): string {
  if (!endsAt) return "";
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Closed";
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) {
    const mins = Math.floor(ms / 60000);
    return `${mins}m left`;
  }
  if (hours < 48) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h left`;
}

export default function LogoVotePage() {
  const [data, setData] = useState<LogoVoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null);
  const [previewConcept, setPreviewConcept] = useState<Concept | null>(null);

  const [commentText, setCommentText] = useState("");
  const [commentConceptId, setCommentConceptId] = useState<string | null>(null);
  const [savingComment, setSavingComment] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/logo-vote");
      if (!res.ok) throw new Error("fetch failed");
      const d: LogoVoteData = await res.json();
      setData(d);
      if (d.myComment) {
        setCommentText(d.myComment.comment);
        setCommentConceptId(d.myComment.concept_id);
      }
    } catch {
      toast.error("Failed to load logo vote");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleVote(conceptId: string) {
    if (!data?.isOpen) return;
    setVoting(conceptId);
    try {
      const res = await fetch("/api/logo-vote/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept_id: conceptId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "vote failed");
      toast.success("Your vote is in. Thank you!");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to vote");
    } finally {
      setVoting(null);
    }
  }

  async function handleComment() {
    const trimmed = commentText.trim();
    if (trimmed.length < 2) {
      toast.error("Please write at least a couple of words");
      return;
    }
    setSavingComment(true);
    try {
      const res = await fetch("/api/logo-vote/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: trimmed, concept_id: commentConceptId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "save failed");
      toast.success("Feedback saved. Thank you!");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingComment(false);
    }
  }

  async function handleDeleteComment() {
    if (!confirm("Remove your feedback?")) return;
    try {
      const res = await fetch("/api/logo-vote/comment", { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setCommentText("");
      setCommentConceptId(null);
      toast.success("Feedback removed");
      load();
    } catch {
      toast.error("Failed to remove feedback");
    }
  }

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.concepts].sort((a, b) => b.votes - a.votes);
  }, [data]);

  const winnerName = useMemo(() => {
    if (!data?.winnerConceptId) return null;
    return data.concepts.find((c) => c.id === data.winnerConceptId)?.name || null;
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-muted/30 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-80 bg-muted/30 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return <p className="text-sm text-muted-foreground">Could not load.</p>;

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-amber-50">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-primary mb-2">
                <Sparkles size={14} /> MEMBER VOTE
              </div>
              <h1 className="text-2xl font-bold mb-2">Help us choose the official TANHOWA logo</h1>
              <p className="text-sm text-muted-foreground max-w-xl">
                Six concept directions are on the table. Vote for the one you&apos;d be proud to see on every TANHOWA letter,
                certificate, and post. Your single vote can be changed any time before voting closes — and your feedback
                is welcome at the bottom of the page.
              </p>
            </div>
            <div className="text-right">
              {data.winnerConceptId ? (
                <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 rounded-xl px-3 py-2 text-sm font-semibold">
                  <Trophy size={16} /> Winner: {winnerName}
                </div>
              ) : data.isOpen ? (
                <>
                  <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 rounded-xl px-3 py-2 text-sm font-semibold">
                    <Clock size={14} /> {formatTimeLeft(data.endsAt)}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">{data.totalVotes} member{data.totalVotes === 1 ? "" : "s"} voted</p>
                </>
              ) : (
                <div className="inline-flex items-center gap-2 bg-muted text-muted-foreground rounded-xl px-3 py-2 text-sm font-semibold">
                  Voting closed
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live tally bar (only after a vote is cast) */}
      {data.myVote && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5"><Vote size={13} /> LIVE RESULTS</span>
              <span>{data.totalVotes} vote{data.totalVotes === 1 ? "" : "s"}</span>
            </div>
            <div className="space-y-1.5">
              {sorted.map((c) => {
                const pct = data.totalVotes > 0 ? Math.round((c.votes / data.totalVotes) * 100) : 0;
                const isMine = c.id === data.myVote;
                return (
                  <div key={c.id} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className={isMine ? "font-bold text-primary" : "font-medium"}>
                        {c.name}{isMine && " (your pick)"}
                      </span>
                      <span className="font-semibold tabular-nums">{pct}% &middot; {c.votes}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full transition-all ${isMine ? "bg-primary" : "bg-emerald-400"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Concept grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.concepts.map((c) => {
          const isMyVote = data.myVote === c.id;
          const isWinner = data.winnerConceptId === c.id;
          return (
            <Card
              key={c.id}
              className={`overflow-hidden transition ${
                isWinner ? "ring-2 ring-emerald-500" :
                isMyVote ? "ring-2 ring-primary" : "hover:shadow-md"
              }`}
            >
              <button
                type="button"
                onClick={() => setPreviewConcept(c)}
                className="w-full bg-gradient-to-br from-amber-50 to-emerald-50 aspect-[4/5] flex items-center justify-center p-4 relative"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image_url} alt={c.name} className="w-full h-full object-contain" />
                {isWinner && (
                  <div className="absolute top-2 right-2 bg-emerald-600 text-white text-xs font-bold rounded-full px-2.5 py-1 flex items-center gap-1">
                    <Trophy size={12} /> Winner
                  </div>
                )}
                {isMyVote && !isWinner && (
                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs font-bold rounded-full px-2.5 py-1 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Your vote
                  </div>
                )}
                <div className="absolute bottom-2 right-2 bg-black/40 text-white text-[10px] rounded px-2 py-0.5 flex items-center gap-1">
                  <Eye size={10} /> View
                </div>
              </button>
              <CardContent className="p-4 space-y-3">
                <div>
                  <h3 className="font-bold text-base">{c.name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">{c.blurb}</p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {c.votes} vote{c.votes === 1 ? "" : "s"}
                  </span>
                  {data.isOpen ? (
                    <Button
                      size="sm"
                      variant={isMyVote ? "default" : "outline"}
                      disabled={voting !== null || isMyVote}
                      onClick={() => handleVote(c.id)}
                      className="gap-1"
                    >
                      {isMyVote ? <><CheckCircle2 size={14} /> Voted</> : voting === c.id ? "Voting…" : "Vote for this"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      {isMyVote ? "Your pick" : "Closed"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Comment & feedback section */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-primary" />
            <h2 className="font-bold">Share your feedback</h2>
            <span className="text-xs text-muted-foreground">— optional, visible to other members</span>
          </div>

          {data.isOpen ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-semibold text-muted-foreground">About:</span>
                <button
                  type="button"
                  className={`text-xs px-2.5 py-1 rounded-full border ${commentConceptId === null ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                  onClick={() => setCommentConceptId(null)}
                >
                  General feedback
                </button>
                {data.concepts.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className={`text-xs px-2.5 py-1 rounded-full border ${commentConceptId === c.id ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                    onClick={() => setCommentConceptId(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="What works, what could be improved, what would you change…"
                rows={3}
                maxLength={800}
              />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-muted-foreground">{commentText.length}/800 — your name &amp; district will be shown.</span>
                <div className="flex gap-2">
                  {data.myComment && (
                    <Button size="sm" variant="ghost" onClick={handleDeleteComment}>Remove</Button>
                  )}
                  <Button size="sm" onClick={handleComment} disabled={savingComment || commentText.trim().length < 2}>
                    {savingComment ? "Saving…" : data.myComment ? "Update feedback" : "Post feedback"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Voting is closed — feedback is no longer accepted.</p>
          )}

          {/* Feed */}
          {data.comments.length > 0 ? (
            <div className="space-y-3 pt-3 border-t">
              <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">All feedback ({data.comments.length})</h3>
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {data.comments.map((c) => {
                  const conceptName = c.concept_id ? data.concepts.find((x) => x.id === c.concept_id)?.name : null;
                  return (
                    <div key={c.id} className={`rounded-xl border p-3 ${c.is_mine ? "bg-primary/5 border-primary/30" : "bg-muted/20"}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-xs">
                          <span className="font-bold">{c.author_name}</span>
                          {(c.author_designation || c.author_district) && (
                            <span className="text-muted-foreground"> — {[c.author_designation, c.author_district].filter(Boolean).join(", ")}</span>
                          )}
                          {c.is_mine && <span className="ml-2 text-[10px] uppercase tracking-wider text-primary font-bold">you</span>}
                        </div>
                        {conceptName && (
                          <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">{conceptName}</span>
                        )}
                      </div>
                      <p className="text-sm mt-1.5 whitespace-pre-wrap">{c.comment}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No feedback yet. Be the first.</p>
          )}
        </CardContent>
      </Card>

      {/* Preview dialog */}
      <Dialog open={!!previewConcept} onOpenChange={(o) => !o && setPreviewConcept(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle>{previewConcept?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            {previewConcept && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-amber-50 to-emerald-50 rounded-xl border p-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewConcept.image_url} alt={previewConcept.name} className="w-full max-h-[60vh] object-contain mx-auto" />
                </div>
                <p className="text-sm text-muted-foreground">{previewConcept.blurb}</p>
              </div>
            )}
          </div>
          <div className="px-6 py-3 border-t bg-background flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{previewConcept?.votes || 0} vote{previewConcept?.votes === 1 ? "" : "s"} so far</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPreviewConcept(null)}>Close</Button>
              {previewConcept && data.isOpen && data.myVote !== previewConcept.id && (
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={() => { handleVote(previewConcept.id); setPreviewConcept(null); }}
                >
                  <Vote size={14} /> Vote for this
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
