"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Trophy, Flame, TrendingUp, Star, Medal } from "lucide-react";
import { REASON_LABELS } from "@/lib/task-points";

type Level = { name: string; emoji: string; index: number; next: { name: string; emoji: string; min: number } | null; pointsToNext: number; progressPct: number };
type Me = { points: number; level: Level; rank: number | null; streak: number; breakdown: Record<string, number>; recent: { points: number; reason: string; created_at: string }[] };
type Row = { rank: number; name: string; district: string; points: number; level: { name: string; emoji: string }; isMe: boolean };
type Data = { me: Me; leaderboard: Row[] };

export default function RewardsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"week" | "month" | "all">("all");
  const [scope, setScope] = useState<"overall" | "district">("overall");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/gamification?period=${period}&scope=${scope}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .finally(() => setLoading(false));
  }, [period, scope]);

  useEffect(() => { load(); }, [load]);

  const me = data?.me;
  const lvl = me?.level;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Trophy className="text-amber-500" /> Rewards &amp; Progress</h1>
        <p className="text-muted-foreground text-sm mt-1">Earn points for the tasks you take on and complete. Climb the levels and the leaderboard.</p>
      </div>

      {/* Level / progress hero */}
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-amber-50">
        <CardContent className="pt-6">
          {loading || !me || !lvl ? (
            <div className="h-24 animate-pulse bg-muted/40 rounded-xl" />
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="text-center shrink-0">
                <div className="text-5xl">{lvl.emoji}</div>
                <p className="font-bold mt-1">{lvl.name}</p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-end justify-between mb-1">
                  <span className="text-3xl font-bold text-primary">{me.points.toLocaleString("en-IN")} <span className="text-sm font-medium text-muted-foreground">pts</span></span>
                  {me.rank && <span className="text-sm text-muted-foreground">Rank <b className="text-foreground">#{me.rank}</b></span>}
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-amber-400" style={{ width: `${lvl.progressPct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {lvl.next ? <>{lvl.pointsToNext} pts to {lvl.next.emoji} {lvl.next.name}</> : "Max level reached — Master Horticulturist 🏆"}
                </p>
              </div>
              <div className="flex sm:flex-col gap-3 sm:gap-2 shrink-0">
                <div className="flex items-center gap-1.5 text-sm"><Flame className="text-orange-500" size={18} /><span><b>{me.streak}</b> wk streak</span></div>
                <div className="flex items-center gap-1.5 text-sm"><Star className="text-amber-500" size={18} /><span>Level {lvl.index + 1}/5</span></div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Points breakdown */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp size={18} /> How you earned</CardTitle></CardHeader>
          <CardContent>
            {!me || Object.keys(me.breakdown).length === 0 ? (
              <EmptyState icon={Star} title="No points yet" description="Commit to and complete tasks to start earning." />
            ) : (
              <div className="space-y-2">
                {Object.entries(me.breakdown).sort((a, b) => b[1] - a[1]).map(([reason, pts]) => (
                  <div key={reason} className="flex items-center justify-between text-sm border-b last:border-0 py-1.5">
                    <span>{REASON_LABELS[reason] || reason}</span>
                    <span className="font-mono font-semibold text-primary">+{pts}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leaderboard */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2"><Medal size={18} className="text-amber-500" /> Leaderboard</CardTitle>
              <div className="flex gap-1 flex-wrap">
                {(["week", "month", "all"] as const).map((p) => (
                  <Button key={p} size="sm" variant={period === p ? "default" : "outline"} className="h-7 text-xs capitalize" onClick={() => setPeriod(p)}>{p}</Button>
                ))}
                <span className="w-1" />
                {(["overall", "district"] as const).map((s) => (
                  <Button key={s} size="sm" variant={scope === s ? "default" : "outline"} className="h-7 text-xs capitalize" onClick={() => setScope(s)}>{s}</Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 animate-pulse bg-muted/40 rounded" />)}</div>
            ) : !data || data.leaderboard.length === 0 ? (
              <EmptyState icon={Trophy} title="Leaderboard is empty" description="No points in this period yet." />
            ) : (
              <div className="space-y-1">
                {data.leaderboard.map((r) => (
                  <div key={r.rank} className={`flex items-center gap-3 py-1.5 px-2 rounded-lg text-sm ${r.isMe ? "bg-primary/10 border border-primary/30" : ""}`}>
                    <span className={`w-7 text-center font-bold ${r.rank === 1 ? "text-amber-500" : r.rank === 2 ? "text-slate-400" : r.rank === 3 ? "text-orange-700" : "text-muted-foreground"}`}>
                      {r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}
                    </span>
                    <span className="flex-1 min-w-0 truncate font-medium">{r.name}{r.isMe && <span className="text-xs text-primary ml-1">(you)</span>}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[120px]">{r.district}</span>
                    <span title={r.level.name}>{r.level.emoji}</span>
                    <span className="font-mono font-semibold text-primary w-14 text-right">{r.points.toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
