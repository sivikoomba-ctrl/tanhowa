"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { toast } from "sonner";
import { TrendingUp, MapPin, Vote, Crown, Check, Info } from "lucide-react";

interface BallotCandidate {
  id: string;
  name: string;
  district: string | null;
  statement: string | null;
  votes: number;
}

interface PollingPost {
  id: string;
  title: string;
  description: string | null;
  district: string | null;
  status: string; // voting_open | closed
  eligible: boolean;
  myVote: string | null;
  totalVotes: number;
  eligibleVoters: number;
  candidates: BallotCandidate[];
}

export default function PollingPage() {
  const [posts, setPosts] = useState<PollingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // candidate id mid-request
  const firstLoad = useRef(true);

  const load = async () => {
    try {
      const res = await fetch("/api/elections/vote");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load");
      setPosts(d.posts || []);
    } catch (e) {
      if (firstLoad.current) toast.error(e instanceof Error ? e.message : "Failed to load polling dashboard");
    } finally {
      setLoading(false);
      firstLoad.current = false;
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // live refresh
    return () => clearInterval(t);
  }, []);

  const castVote = async (post: PollingPost, candidate: BallotCandidate) => {
    if (post.myVote === candidate.id) return; // already your vote
    setBusy(candidate.id);
    try {
      const res = await fetch("/api/elections/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: post.id, candidate_id: candidate.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to vote");
      toast.success(`Vote recorded for ${candidate.name}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cast vote");
    } finally {
      setBusy(null);
    }
  };

  const retract = async (post: PollingPost) => {
    if (!confirm(`Retract your vote for "${post.title}"?`)) return;
    try {
      const res = await fetch(`/api/elections/vote?post_id=${post.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed to retract");
      toast.success("Vote retracted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to retract vote");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="text-primary" size={24} /> Polling Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cast your vote in open elections and watch live results. Your ballot is secret — only the tallies are shown.
          Results refresh automatically.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="pt-6"><div className="h-32 animate-pulse bg-muted rounded-xl" /></CardContent></Card>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={Vote}
          title="No active polls"
          description="No positions are open for voting or have published results yet. Please check back during the voting window."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {posts.map((post) => {
            const isOpen = post.status === "voting_open";
            const canVote = isOpen && post.eligible;
            const turnout = post.eligibleVoters > 0 ? Math.round((post.totalVotes / post.eligibleVoters) * 100) : 0;
            const leadVotes = post.candidates[0]?.votes || 0;
            return (
              <Card key={post.id} className="rounded-2xl">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{post.title}</h3>
                    {post.district && (
                      <Badge variant="outline" className="text-xs bg-secondary/10 text-secondary-foreground border-secondary/30">
                        <MapPin size={11} className="mr-0.5" /> {post.district}
                      </Badge>
                    )}
                    <Badge variant="outline" className={`text-xs ${isOpen ? "bg-green-50 text-green-700 border-green-300" : "bg-red-50 text-red-700 border-red-300"}`}>
                      {isOpen ? "Voting Open" : "Closed"}
                    </Badge>
                  </div>
                  {post.description && <p className="text-sm text-muted-foreground mt-1">{post.description}</p>}

                  <p className="text-xs text-muted-foreground mt-2">
                    {post.totalVotes} of {post.eligibleVoters} eligible voted ({turnout}%)
                  </p>

                  {post.candidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic mt-3">No candidates on the ballot yet.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {post.candidates.map((c) => {
                        const pct = post.totalVotes > 0 ? Math.round((c.votes / post.totalVotes) * 100) : 0;
                        const isMine = post.myVote === c.id;
                        const isWinner = !isOpen && c.votes > 0 && c.votes === leadVotes;
                        const clickable = canVote && busy === null;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={!clickable}
                            onClick={() => clickable && castVote(post, c)}
                            className={`w-full text-left rounded-xl border p-2.5 transition relative overflow-hidden ${
                              isMine ? "border-primary bg-primary/5" : "border-border"
                            } ${clickable ? "hover:border-primary/60 cursor-pointer" : "cursor-default"}`}
                          >
                            {/* vote bar */}
                            <div
                              className={`absolute inset-y-0 left-0 ${isWinner ? "bg-green-100" : "bg-muted"} `}
                              style={{ width: `${pct}%` }}
                              aria-hidden
                            />
                            <div className="relative flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate flex items-center gap-1">
                                  {c.name}
                                  {isWinner && <Crown size={13} className="text-green-600" />}
                                  {isMine && (
                                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/40">
                                      <Check size={10} className="mr-0.5" /> Your vote
                                    </Badge>
                                  )}
                                </p>
                                {c.statement && <p className="text-xs text-muted-foreground truncate">{c.statement}</p>}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-semibold">{pct}%</p>
                                <p className="text-[11px] text-muted-foreground">{c.votes} {c.votes === 1 ? "vote" : "votes"}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Footer actions / notes */}
                  {isOpen && !post.eligible && (
                    <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                      <Info size={12} /> This belongs to another district — you can watch results but cannot vote.
                    </p>
                  )}
                  {canVote && post.candidates.length > 0 && (
                    <div className="mt-3 flex items-center gap-3">
                      <p className="text-xs text-muted-foreground">
                        {post.myVote ? "Tap another candidate to change your vote." : "Tap a candidate to cast your vote."}
                      </p>
                      {post.myVote && (
                        <button type="button" onClick={() => retract(post)} className="text-xs text-destructive underline">
                          Retract
                        </button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
