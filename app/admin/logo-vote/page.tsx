"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trophy, Lock, Unlock, CalendarPlus, Trash2, Megaphone, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Concept { id: string; slug: string; name: string; blurb: string; image_url: string; votes: number }
interface Comment {
  id: string; concept_id: string | null; comment: string; created_at: string;
  is_mine: boolean; author_name: string; author_designation: string; author_district: string;
}
interface PublicData {
  concepts: Concept[]; totalVotes: number; isOpen: boolean;
  startedAt: string | null; endsAt: string | null; winnerConceptId: string | null;
  myVote: string | null; comments: Comment[];
}
interface AdminData {
  tally: { concept_id: string; count: number }[];
  districtBreakdown: Record<string, Record<string, number>>;
  designationBreakdown: Record<string, Record<string, number>>;
  voters: { user_id: string; user_name: string; designation: string; district: string; concept_id: string; voted_at: string }[];
  totalVotes: number;
}

export default function AdminLogoVotePage() {
  const [pub, setPub] = useState<PublicData | null>(null);
  const [adm, setAdm] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [announceTarget, setAnnounceTarget] = useState<Concept | null>(null);

  async function load() {
    try {
      const [p, a] = await Promise.all([
        fetch("/api/logo-vote").then((r) => r.json()),
        fetch("/api/logo-vote/admin").then((r) => r.json()),
      ]);
      setPub(p);
      setAdm(a);
    } catch {
      toast.error("Failed to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function call(action: string, body: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      const res = await fetch("/api/logo-vote/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "action failed");
      return j;
    } finally {
      setBusy(null);
    }
  }

  async function handleOpen() {
    try {
      await call("open", { days: 7 });
      toast.success("Voting opened (7 days)");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }
  async function handleClose() {
    if (!confirm("Close voting now?")) return;
    try { await call("close"); toast.success("Voting closed"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }
  async function handleExtend(days: number) {
    try { const r = await call("extend", { days }); toast.success(`Extended to ${new Date(r.ends_at).toLocaleString()}`); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }
  async function handleAnnounce() {
    if (!announceTarget) return;
    try {
      await call("announce", { concept_id: announceTarget.id });
      toast.success(`"${announceTarget.name}" announced as the winner`);
      setAnnounceTarget(null);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }
  async function handleDeleteComment(id: string) {
    if (!confirm("Delete this comment?")) return;
    try { await call("delete_comment", { id }); toast.success("Comment deleted"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  const sortedConcepts = useMemo(() => {
    if (!pub) return [];
    return [...pub.concepts].sort((a, b) => b.votes - a.votes);
  }, [pub]);

  const leader = sortedConcepts[0];

  if (loading) return <div className="space-y-4"><div className="h-32 bg-muted/30 rounded-2xl animate-pulse" /><div className="h-96 bg-muted/30 rounded-2xl animate-pulse" /></div>;
  if (!pub || !adm) return <p>Failed to load.</p>;

  const winnerConcept = pub.winnerConceptId ? pub.concepts.find((c) => c.id === pub.winnerConceptId) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Logo Vote &mdash; Admin</h1>
        <p className="text-sm text-muted-foreground">Live tally, district breakdown, comment moderation, announce winner.</p>
      </div>

      {/* Status + actions */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold tracking-wider text-muted-foreground">STATUS</div>
              {winnerConcept ? (
                <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                  <Trophy size={16} /> Winner announced: {winnerConcept.name}
                </div>
              ) : pub.isOpen ? (
                <div className="text-emerald-700 font-semibold">Voting is OPEN</div>
              ) : (
                <div className="text-muted-foreground font-semibold">Voting is closed</div>
              )}
              {pub.endsAt && !winnerConcept && (
                <p className="text-xs text-muted-foreground">Ends: {new Date(pub.endsAt).toLocaleString()}</p>
              )}
              <p className="text-xs text-muted-foreground">{pub.totalVotes} vote{pub.totalVotes === 1 ? "" : "s"} total</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!winnerConcept && (
                pub.isOpen ? (
                  <>
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => handleExtend(3)} className="gap-1">
                      <CalendarPlus size={14} /> +3 days
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => handleExtend(7)} className="gap-1">
                      <CalendarPlus size={14} /> +7 days
                    </Button>
                    <Button size="sm" variant="destructive" disabled={busy !== null} onClick={handleClose} className="gap-1">
                      <Lock size={14} /> Close voting
                    </Button>
                  </>
                ) : (
                  <Button size="sm" disabled={busy !== null} onClick={handleOpen} className="gap-1">
                    <Unlock size={14} /> Open voting (7 days)
                  </Button>
                )
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tally */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold">Live tally</h2>
            <span className="text-xs text-muted-foreground">{pub.totalVotes} total votes</span>
          </div>
          <div className="space-y-2">
            {sortedConcepts.map((c, i) => {
              const pct = pub.totalVotes > 0 ? Math.round((c.votes / pub.totalVotes) * 100) : 0;
              const isLeader = i === 0 && c.votes > 0;
              return (
                <div key={c.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.image_url} alt="" className="w-10 h-10 object-contain rounded bg-gradient-to-br from-amber-50 to-emerald-50 border" />
                      <span className={`text-sm ${isLeader ? "font-bold" : "font-medium"}`}>
                        {c.name}{isLeader && " 🏆"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold tabular-nums">{pct}%</span>
                      <span className="text-xs text-muted-foreground">{c.votes} vote{c.votes === 1 ? "" : "s"}</span>
                      {!winnerConcept && (
                        <Button size="sm" variant="outline" onClick={() => setAnnounceTarget(c)} className="gap-1">
                          <Megaphone size={13} /> Announce
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${isLeader ? "bg-emerald-500" : "bg-emerald-300"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* District breakdown */}
      <Card>
        <CardContent className="p-5">
          <h2 className="font-bold mb-3">District breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-semibold">District</th>
                  {pub.concepts.map((c) => <th key={c.id} className="text-center py-2 px-2 font-semibold">{c.name}</th>)}
                  <th className="text-center py-2 px-2 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const districts = new Set<string>();
                  for (const cid of Object.keys(adm.districtBreakdown)) {
                    for (const d of Object.keys(adm.districtBreakdown[cid])) districts.add(d);
                  }
                  return [...districts].sort().map((d) => {
                    let total = 0;
                    return (
                      <tr key={d} className="border-b last:border-0">
                        <td className="py-2 font-medium">{d}</td>
                        {pub.concepts.map((c) => {
                          const v = adm.districtBreakdown[c.id]?.[d] || 0;
                          total += v;
                          return <td key={c.id} className="text-center py-2 px-2">{v || "—"}</td>;
                        })}
                        <td className="text-center py-2 px-2 font-bold">{total}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Comments moderation */}
      <Card>
        <CardContent className="p-5">
          <h2 className="font-bold mb-3">Member feedback ({pub.comments.length})</h2>
          {pub.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No feedback yet.</p>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {pub.comments.map((c) => {
                const conceptName = c.concept_id ? pub.concepts.find((x) => x.id === c.concept_id)?.name : null;
                return (
                  <div key={c.id} className="rounded-xl border p-3 bg-muted/20">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="text-xs">
                        <span className="font-bold">{c.author_name}</span>
                        {(c.author_designation || c.author_district) && (
                          <span className="text-muted-foreground"> &mdash; {[c.author_designation, c.author_district].filter(Boolean).join(", ")}</span>
                        )}
                        {conceptName && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">{conceptName}</span>
                        )}
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => handleDeleteComment(c.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                    <p className="text-sm mt-1.5 whitespace-pre-wrap">{c.comment}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Announce winner dialog */}
      <Dialog open={!!announceTarget} onOpenChange={(o) => !o && setAnnounceTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Announce winner: {announceTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {announceTarget && (
              <div className="bg-gradient-to-br from-amber-50 to-emerald-50 rounded-xl border p-4 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={announceTarget.image_url} alt="" className="max-h-48 object-contain" />
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              This will lock voting, mark <strong>{announceTarget?.name}</strong> as the official winner, and post an announcement to all members. This cannot be undone from the UI.
            </p>
            {leader && announceTarget && leader.id !== announceTarget.id && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Heads up: this is not the current vote leader (<strong>{leader.name}</strong> with {leader.votes} votes).
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnounceTarget(null)}>Cancel</Button>
            <Button onClick={handleAnnounce} disabled={busy !== null} className="gap-1">
              {busy === "announce" ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />}
              Confirm &amp; Announce
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
