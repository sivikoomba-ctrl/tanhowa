"use client";

import { useState, useEffect } from "react";
import { Trophy, Lock, Clock, CheckCircle, Wallet, MessageSquare, Lightbulb, CalendarCheck, LogIn, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

interface EarnedBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned_at: string;
}

interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface Stats {
  contributionMinutes: number;
  actionCount: number;
  uniqueActionTypes: number;
  tasksCompleted: number;
  subscriptionsPaid: number;
  totalSubscriptions: number;
  grievancesSubmitted: number;
  ideasSubmitted: number;
  eventsRsvp: number;
  loginCount: number;
  daysSinceJoined: number;
}

interface NewBadge {
  id: string;
  name: string;
  icon: string;
}

// Progress calculation for each badge
function getBadgeProgress(badgeId: string, stats: Stats): { current: number; target: number; label: string } | null {
  switch (badgeId) {
    case "century": return { current: Math.min(stats.contributionMinutes, 100), target: 100, label: `${stats.contributionMinutes}/100 minutes` };
    case "half_century": return { current: Math.min(stats.contributionMinutes, 50), target: 50, label: `${stats.contributionMinutes}/50 minutes` };
    case "dedicated": return { current: Math.min(stats.contributionMinutes, 200), target: 200, label: `${stats.contributionMinutes}/200 minutes` };
    case "all_rounder": return { current: Math.min(stats.uniqueActionTypes, 5), target: 5, label: `${stats.uniqueActionTypes}/5 categories` };
    case "task_master": return { current: Math.min(stats.tasksCompleted, 10), target: 10, label: `${stats.tasksCompleted}/10 tasks` };
    case "task_starter": return { current: Math.min(stats.tasksCompleted, 1), target: 1, label: `${stats.tasksCompleted}/1 task` };
    case "payment_champion": return { current: stats.subscriptionsPaid, target: Math.max(stats.totalSubscriptions, 1), label: `${stats.subscriptionsPaid}/${stats.totalSubscriptions} paid` };
    case "voice_of_change": return { current: Math.min(stats.grievancesSubmitted, 5), target: 5, label: `${stats.grievancesSubmitted}/5 submissions` };
    case "idea_factory": return { current: Math.min(stats.ideasSubmitted, 3), target: 3, label: `${stats.ideasSubmitted}/3 ideas` };
    case "social_butterfly": return { current: Math.min(stats.eventsRsvp, 5), target: 5, label: `${stats.eventsRsvp}/5 RSVPs` };
    case "loyal_member": return { current: Math.min(stats.daysSinceJoined, 180), target: 180, label: `${stats.daysSinceJoined}/180 days` };
    case "pioneer": return { current: Math.min(stats.daysSinceJoined, 365), target: 365, label: `${stats.daysSinceJoined}/365 days` };
    case "regular": return { current: Math.min(stats.loginCount, 50), target: 50, label: `${stats.loginCount}/50 logins` };
    default: return null;
  }
}

export default function AchievementsPage() {
  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [allBadges, setAllBadges] = useState<BadgeDef[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const t = useT();

  useEffect(() => {
    fetch("/api/achievements?me=true")
      .then((r) => r.json())
      .then((data) => {
        setBadges(data.badges || []);
        setAllBadges(data.allBadges || []);
        setStats(data.stats || null);

        // Show toast for newly earned badges
        const newBadges: NewBadge[] = data.newBadges || [];
        if (newBadges.length > 0) {
          for (const nb of newBadges) {
            toast.success(`${nb.icon} New badge earned: ${nb.name}!`, {
              duration: 5000,
            });
          }
        }
      })
      .catch(() => {
        toast.error("Failed to load achievements");
      })
      .finally(() => setLoading(false));
  }, []);

  const earnedSet = new Set(badges.map((b) => b.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t("nav.achievements")}</h1>
          <p className="text-sm text-muted-foreground">
            {badges.length}/{allBadges.length} badges earned
          </p>
        </div>
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard
            label="Contribution Time"
            value={`${stats.contributionMinutes}m`}
            icon={Clock}
            borderColor="border-l-blue-500"
            iconColor="text-blue-400"
            loading={loading}
          />
          <MetricCard
            label="Tasks Completed"
            value={stats.tasksCompleted}
            icon={CheckCircle}
            borderColor="border-l-green-500"
            iconColor="text-green-400"
            loading={loading}
          />
          <MetricCard
            label="Subscriptions Paid"
            value={`${stats.subscriptionsPaid}/${stats.totalSubscriptions}`}
            icon={Wallet}
            borderColor="border-l-amber-500"
            iconColor="text-amber-400"
            loading={loading}
          />
          <MetricCard
            label="Total Logins"
            value={stats.loginCount}
            icon={LogIn}
            borderColor="border-l-purple-500"
            iconColor="text-purple-400"
            loading={loading}
          />
        </div>
      )}

      {/* My Badges */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg">My Badges</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {allBadges.map((badge) => {
                const earned = badges.find((b) => b.id === badge.id);
                const isEarned = !!earned;

                return (
                  <div
                    key={badge.id}
                    className={`relative rounded-2xl border-l-4 p-4 transition-all ${
                      isEarned
                        ? "border-l-amber-500 bg-amber-50/50"
                        : "border-l-gray-200 bg-muted/30 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-2xl">{badge.icon}</span>
                      {!isEarned && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                    <p className="text-sm font-semibold mt-2">{badge.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{badge.description}</p>
                    {isEarned && earned && (
                      <Badge variant="outline" className="mt-2 text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                        {new Date(earned.earned_at).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress Section */}
      {stats && !loading && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-lg">Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {allBadges
              .filter((b) => !earnedSet.has(b.id))
              .map((badge) => {
                const progress = getBadgeProgress(badge.id, stats);
                if (!progress) return null;
                const pct = Math.min((progress.current / progress.target) * 100, 100);

                return (
                  <div key={badge.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{badge.icon}</span>
                        <span className="text-sm font-medium">{badge.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{progress.label}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct >= 75 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-blue-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {allBadges.filter((b) => !earnedSet.has(b.id)).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                All badges earned! Congratulations!
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Additional Stats Detail */}
      {stats && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Actions Performed"
            value={stats.actionCount}
            icon={CheckCircle}
            borderColor="border-l-indigo-500"
            iconColor="text-indigo-400"
          />
          <MetricCard
            label="Suggestions/Grievances"
            value={stats.grievancesSubmitted}
            icon={MessageSquare}
            borderColor="border-l-orange-500"
            iconColor="text-orange-400"
          />
          <MetricCard
            label="Ideas Submitted"
            value={stats.ideasSubmitted}
            icon={Lightbulb}
            borderColor="border-l-yellow-500"
            iconColor="text-yellow-400"
          />
          <MetricCard
            label="Event RSVPs"
            value={stats.eventsRsvp}
            icon={CalendarCheck}
            borderColor="border-l-teal-500"
            iconColor="text-teal-400"
          />
          <MetricCard
            label="Action Categories"
            value={stats.uniqueActionTypes}
            icon={Timer}
            borderColor="border-l-pink-500"
            iconColor="text-pink-400"
          />
          <MetricCard
            label="Days as Member"
            value={stats.daysSinceJoined}
            icon={Trophy}
            borderColor="border-l-emerald-500"
            iconColor="text-emerald-400"
          />
        </div>
      )}
    </div>
  );
}
