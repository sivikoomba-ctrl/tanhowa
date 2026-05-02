"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { MetricCard } from "@/components/metric-card";
import {
  Activity, Award, Calendar, Clock, TrendingUp, Flame,
  Target, Loader2,
} from "lucide-react";

interface ActivityData {
  totalContributions: number;
  totalMinutes: number;
  currentStreak: number;
  longestStreak: number;
  thisWeek: number;
  thisMonth: number;
  topActions: { action: string; count: number; label: string }[];
  recentDays: { date: string; count: number }[];
  badges: { name: string; earned: boolean; description: string }[];
  loginCount: number;
  memberSince: string;
}

export default function ActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/contributions?me=true&period=all")
      .then((r) => r.json())
      .then((d) => {
        const contributions = d.contributions || [];
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const thisWeek = contributions.filter((c: { created_at: string }) => new Date(c.created_at) >= weekAgo).length;
        const thisMonth = contributions.filter((c: { created_at: string }) => new Date(c.created_at) >= monthAgo).length;
        const totalMinutes = contributions.reduce((sum: number, c: { estimated_minutes: number }) => sum + (c.estimated_minutes || 0), 0);

        // Calculate streaks (days with at least 1 contribution)
        const daySet = new Set<string>(contributions.map((c: { created_at: string }) => c.created_at.slice(0, 10)));
        const days = Array.from(daySet).sort().reverse();
        let currentStreak = 0;
        let longestStreak = 0;
        let streak = 0;
        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

        // Current streak
        if (days[0] === today || days[0] === yesterday) {
          for (let i = 0; i < days.length; i++) {
            const expected = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
            if (days[i] === expected || (i === 0 && days[0] === yesterday)) {
              currentStreak++;
            } else break;
          }
        }

        // Longest streak
        let prev = "";
        for (const day of Array.from(daySet).sort()) {
          if (prev) {
            const diff = (new Date(day).getTime() - new Date(prev).getTime()) / 86400000;
            if (diff === 1) streak++;
            else streak = 1;
          } else streak = 1;
          longestStreak = Math.max(longestStreak, streak);
          prev = day;
        }

        // Top actions
        const actionCounts: Record<string, number> = {};
        for (const c of contributions) {
          actionCounts[c.action] = (actionCounts[c.action] || 0) + 1;
        }
        const topActions = Object.entries(actionCounts)
          .map(([action, count]) => ({ action, count, label: action.replace(/_/g, " ") }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);

        // Recent 30 days activity
        const recentDays: { date: string; count: number }[] = [];
        for (let i = 29; i >= 0; i--) {
          const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
          const count = contributions.filter((c: { created_at: string }) => c.created_at.startsWith(date)).length;
          recentDays.push({ date, count });
        }

        // Badges
        const total = contributions.length;
        const badges = [
          { name: "First Step", earned: total >= 1, description: "Made your first contribution" },
          { name: "Rising Star", earned: total >= 10, description: "10+ contributions" },
          { name: "Dedicated", earned: total >= 50, description: "50+ contributions" },
          { name: "Half Century", earned: total >= 50, description: "50 contributions milestone" },
          { name: "Century", earned: total >= 100, description: "100+ contributions" },
          { name: "Streak Master", earned: longestStreak >= 7, description: "7-day contribution streak" },
          { name: "All-Rounder", earned: Object.keys(actionCounts).length >= 5, description: "5+ different action types" },
        ];

        setData({
          totalContributions: total,
          totalMinutes,
          currentStreak,
          longestStreak,
          thisWeek,
          thisMonth,
          topActions,
          recentDays,
          badges,
          loginCount: 0,
          memberSince: "",
        });
      })
      .catch(() => toast.error("Failed to load activity"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Activity size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">My Activity</h1>
          <p className="text-sm text-muted-foreground">Your portal usage stats and achievements</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Total Contributions" value={data.totalContributions} icon={Target} borderColor="border-blue-500" />
            <MetricCard label="Time Contributed" value={`${Math.round(data.totalMinutes / 60)}h`} icon={Clock} borderColor="border-green-500" />
            <MetricCard label="Current Streak" value={`${data.currentStreak}d`} icon={Flame} borderColor="border-orange-500" />
            <MetricCard label="This Month" value={data.thisMonth} icon={TrendingUp} borderColor="border-purple-500" />
          </div>

          {/* Activity Heatmap (30 days) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar size={14} />Last 30 Days
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-1 flex-wrap">
                {data.recentDays.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.count} contributions`}
                    className={`w-4 h-4 rounded-sm ${
                      d.count === 0 ? "bg-muted" :
                      d.count <= 2 ? "bg-green-200" :
                      d.count <= 5 ? "bg-green-400" :
                      "bg-green-600"
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                <span>Less</span>
                <div className="w-3 h-3 rounded-sm bg-muted" />
                <div className="w-3 h-3 rounded-sm bg-green-200" />
                <div className="w-3 h-3 rounded-sm bg-green-400" />
                <div className="w-3 h-3 rounded-sm bg-green-600" />
                <span>More</span>
                <span className="ml-2">Longest streak: {data.longestStreak} days</span>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Actions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp size={14} />Top Activities
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topActions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
                ) : (
                  <div className="space-y-2">
                    {data.topActions.map((a) => (
                      <div key={a.action} className="flex items-center justify-between">
                        <span className="text-sm capitalize truncate flex-1">{a.label}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-muted rounded-full h-2">
                            <div className="bg-primary h-2 rounded-full" style={{ width: `${(a.count / data.topActions[0].count) * 100}%` }} />
                          </div>
                          <span className="text-xs font-semibold w-8 text-right">{a.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Badges */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Award size={14} />Badges
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {data.badges.map((b) => (
                    <div key={b.name} className={`flex items-center gap-2 p-2 rounded-lg border ${b.earned ? "bg-amber-50 border-amber-200" : "bg-muted/30 border-muted opacity-50"}`}>
                      <Award size={16} className={b.earned ? "text-amber-500" : "text-muted-foreground"} />
                      <div>
                        <p className="text-xs font-semibold">{b.name}</p>
                        <p className="text-[10px] text-muted-foreground">{b.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
