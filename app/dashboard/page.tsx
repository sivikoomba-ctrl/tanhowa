"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Megaphone, Calendar, FileText, UserCheck,
  Wallet, ListTodo, Award, Lightbulb, IndianRupee,
  ArrowRight, Trophy, Cake, MessageCircle, User,
  Flame, Sun, Moon, CloudSun, BarChart3, Check,
  Activity, Star,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { renderSimpleMarkdown } from "@/lib/announcement-markdown";
import { displayPeriod } from "@/lib/subscriptions";
import { MetricCard } from "@/components/metric-card";
import { AdminContacts } from "@/components/admin-contacts";
import { StatusBadge } from "@/components/status-badge";
import { SectionError } from "@/components/section-error";
import ConnectTelegramBanner from "@/components/connect-telegram-banner";
import FieldDiaryNudge from "@/components/field-diary-nudge";
import { useT } from "@/lib/i18n";

function getGreeting(): { text: string; icon: typeof Sun } {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good morning", icon: Sun };
  if (h < 17) return { text: "Good afternoon", icon: CloudSun };
  return { text: "Good evening", icon: Moon };
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

interface Event {
  id: string;
  title: string;
  date: string;
  location: string;
}

interface MySubscription {
  id: string;
  period: string;
  amount: number;
  status: string;
  due_date: string;
}

interface ActivePoll {
  id: string;
  title: string;
  options: string[];
  voteCounts: Record<number, number>;
  totalVotes: number;
  myVote: number | null;
}

interface TodayTodo {
  id: string;
  event_id: string;
  title: string;
  status: string;
  urgent: boolean;
  important: boolean;
  due_date: string | null;
  committedByMe: boolean;
}

function todayQuadrantLabel(urgent: boolean, important: boolean): string | null {
  if (urgent && important) return "Do First";
  if (!urgent && important) return "Schedule";
  if (urgent && !important) return "Delegate";
  return null; // Eliminate quadrant — don't show a pill
}

function todayQuadrantColor(urgent: boolean, important: boolean): string {
  if (urgent && important) return "bg-red-100 text-red-700 border-red-200";
  if (!urgent && important) return "bg-blue-100 text-blue-700 border-blue-200";
  if (urgent && !important) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

export default function DashboardHome() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [stats, setStats] = useState({ members: 0, announcements: 0, events: 0, documents: 0 });
  const [adminContacts, setAdminContacts] = useState<{ id: string; name: string; email: string; phone: string; photo_url: string; occupation: string }[]>([]);
  const [mySubscriptions, setMySubscriptions] = useState<MySubscription[]>([]);
  const [myContributions, setMyContributions] = useState({ count: 0, minutes: 0 });
  const [topContributors, setTopContributors] = useState<{ name: string; action_count: number; total_minutes: number }[]>([]);
  const [birthdays, setBirthdays] = useState<{ name: string; designation: string; district: string; block: string; isToday: boolean; daysUntil: number }[]>([]);
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [milestones, setMilestones] = useState<string[]>([]);
  const [profileComplete, setProfileComplete] = useState(100);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [streak, setStreak] = useState(0);
  const [activePoll, setActivePoll] = useState<ActivePoll | null>(null);
  const [todayTodos, setTodayTodos] = useState<TodayTodo[]>([]);
  const [activityFeed, setActivityFeed] = useState<{ id: string; user_name: string; action: string; description: string; created_at: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const t = useT();
  const greeting = getGreeting();

  function loadData() {
    setLoaded(false);
    setErrors({});

    // Fetch user info + profile completeness + milestones
    fetch("/api/users/me").then((r) => r.json())
      .then((d) => {
        if (d.user?.name) setUserName(d.user.name);
        if (d.user?.role) setUserRole(d.user.role);
        // Profile completeness (10 fields)
        const u = d.user;
        const pd = u?.posting_details || {};
        const sl = u?.social_links || {};
        const fields = [u?.name, u?.phone, u?.occupation, pd.regular_district, u?.photo_url, sl.gender, sl.date_of_birth, sl.qualification, u?.office_address, pd.regular_block];
        setProfileComplete(Math.round((fields.filter(Boolean).length / fields.length) * 100));
        // Milestones
        const ms: string[] = [];
        if (u?.created_at) {
          const joined = new Date(u.created_at);
          const now = new Date();
          const diffDays = Math.floor((now.getTime() - joined.getTime()) / 86400000);
          if (diffDays <= 7) ms.push("Welcome aboard!");
          const years = Math.floor(diffDays / 365);
          if (years >= 1 && Math.abs(diffDays % 365) <= 3) ms.push(`${years} year${years > 1 ? "s" : ""} with TANHOWA!`);
        }
        if (u?.login_count >= 100) ms.push("100+ logins!");
        else if (u?.login_count >= 50) ms.push("50+ logins!");
        setMilestones(ms);
      })
      .catch(() => {});

    // Fetch unread messages
    fetch("/api/messages?unread_count=true").then((r) => r.json())
      .then((d) => setUnreadMessages(d.unreadCount || 0))
      .catch(() => {});

    // Fetch independently so one failure doesn't block others
    fetch("/api/stats").then((r) => r.json())
      .then((s) => { setStats(s); setAdminContacts(s.admins || []); })
      .catch(() => setErrors((e) => ({ ...e, stats: true })));

    fetch("/api/announcements?limit=3").then((r) => r.json())
      .then((d) => setAnnouncements(d.announcements || []))
      .catch(() => setErrors((e) => ({ ...e, announcements: true })));

    fetch("/api/events?limit=3").then((r) => r.json())
      .then((d) => setEvents(d.events || []))
      .catch(() => setErrors((e) => ({ ...e, events: true })));

    fetch("/api/subscriptions?me=true").then((r) => r.json())
      .then((d) => setMySubscriptions((d.subscriptions || []).slice(0, 3)))
      .catch(() => setErrors((e) => ({ ...e, subscriptions: true })));

    fetch("/api/contributions?me=true&period=month").then((r) => r.json())
      .then((d) => {
        const contributions = d.contributions || [];
        const totalMinutes = contributions.reduce((sum: number, c: { estimated_minutes: number }) => sum + (c.estimated_minutes || 0), 0);
        setMyContributions({ count: contributions.length, minutes: totalMinutes });
      })
      .catch(() => setErrors((e) => ({ ...e, contributions: true })))
      .finally(() => setLoaded(true));

    // Fetch activity streak (distinct active days)
    fetch("/api/contributions?me=true&period=week").then((r) => r.json())
      .then((d) => {
        const contribs = d.contributions || [];
        // Count consecutive days ending today
        const today = new Date();
        const daySet = new Set<string>();
        for (const c of contribs) {
          daySet.add(new Date(c.created_at).toLocaleDateString("en-CA"));
        }
        // Also count today since they're active now
        daySet.add(today.toLocaleDateString("en-CA"));
        let days = 0;
        for (let i = 0; i < 7; i++) {
          const d2 = new Date(today);
          d2.setDate(d2.getDate() - i);
          if (daySet.has(d2.toLocaleDateString("en-CA"))) days++;
          else break;
        }
        setStreak(days);
      })
      .catch(() => {});

    // Fetch birthdays
    fetch("/api/users/birthdays").then((r) => r.json())
      .then((d) => setBirthdays(d.birthdays || []))
      .catch(() => {});

    // Fetch top contributors this month (leaderboard)
    fetch("/api/contributions?period=month").then((r) => r.json())
      .then((d) => setTopContributors((d.leaderboard || []).slice(0, 5)))
      .catch(() => {});

    // Fetch activity feed (recent portal activity)
    fetch("/api/contributions?feed=true&limit=8").then((r) => r.json())
      .then((d) => setActivityFeed(d.activities || []))
      .catch(() => {});

    // Fetch top 3 active tasks for Today's Focus card
    fetch("/api/todos/today").then((r) => r.json())
      .then((d) => setTodayTodos(d.todos || []))
      .catch(() => {});

    // Fetch most recent active poll for Quick Poll widget
    fetch("/api/polls").then((r) => r.json())
      .then((d) => {
        const polls = d.polls || [];
        const active = polls.find((p: ActivePoll & { status: string; expires_at?: string }) =>
          p.status === "active" && (!p.expires_at || new Date(p.expires_at) > new Date())
        );
        setActivePoll(active || null);
      })
      .catch(() => {});
  }

  useEffect(() => { loadData(); }, []);

  function formatMinutes(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  function handlePollVote(optionIndex: number) {
    if (!activePoll) return;
    const prev = activePoll;
    // Optimistic update
    const newCounts = { ...prev.voteCounts };
    if (prev.myVote !== null) newCounts[prev.myVote] = (newCounts[prev.myVote] || 1) - 1;
    newCounts[optionIndex] = (newCounts[optionIndex] || 0) + 1;
    const newTotal = prev.totalVotes + (prev.myVote === null ? 1 : 0);
    setActivePoll({ ...prev, myVote: optionIndex, voteCounts: newCounts, totalVotes: newTotal });

    fetch("/api/polls", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poll_id: prev.id, option_index: optionIndex }),
    }).catch(() => setActivePoll(prev)); // Revert on error
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return days === 1 ? "yesterday" : `${days}d ago`;
  }

  const ACTION_LABELS: Record<string, string> = {
    payment_proof_uploaded: "uploaded payment proof",
    payment_verified: "verified a payment",
    payment_rejected: "rejected a payment",
    member_approved: "approved a member",
    announcement_created: "posted an announcement",
    event_created: "created an event",
    document_uploaded: "uploaded a document",
    suggestion_submitted: "submitted a suggestion",
    grievance_submitted: "filed a grievance",
    grievance_responded: "responded to a grievance",
    task_created: "created a task",
    task_committed: "committed to a task",
    task_updated: "updated a task",
    task_note_added: "added a task note",
    task_report_added: "submitted a report",
    voucher_submitted: "submitted a voucher",
    voucher_approved: "approved a voucher",
    expense_voucher_submitted: "submitted an expense",
    expense_voucher_approved: "approved an expense voucher",
    expense_voucher_rejected: "rejected an expense voucher",
    used_ai_pest_id: "used Pest ID tool",
    used_ai_crop_advice: "used Crop Adviser",
    used_ai_translation: "used Translator",
    used_ai_ocr: "used OCR tool",
    idea_submitted: "submitted an idea",
    idea_upvoted: "upvoted an idea",
    poll_created: "created a poll",
  };

  const isSuperAdmin = userRole === "super_admin";
  const pendingSubs = isSuperAdmin ? 0 : mySubscriptions.filter((s) => s.status === "pending" || s.status === "overdue").length;

  return (
    <div className="space-y-6">
      {/* Connect Telegram CTA — auto-hides if already linked or dismissed */}
      <ConnectTelegramBanner />

      {/* Field Diary nudge — auto-hides once submitted or dismissed for today */}
      <FieldDiaryNudge />

      {/* Welcome Greeting */}
      <div>
        <div className="flex items-center gap-2">
          <greeting.icon size={20} className="text-amber-500" />
          <h1 className="text-2xl font-bold text-foreground">
            {userName ? `${greeting.text}, ${userName.split(" ").slice(0, 2).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ")}!` : t("dash.dashboard")}
          </h1>
          {streak >= 2 && (
            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300 text-xs gap-1">
              <Flame size={12} />{streak}-day streak
            </Badge>
          )}
          {milestones.map((ms) => (
            <Badge key={ms} variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300 text-xs gap-1">
              <Star size={12} className="fill-yellow-500" />{ms}
            </Badge>
          ))}
        </div>
        {pendingSubs > 0 && (
          <p className="text-sm text-amber-600 mt-0.5">
            {t("dash.pending_subs", { count: pendingSubs })} — <Link href="/dashboard/subscriptions" className="underline font-medium">{t("dash.pay_now")}</Link>
          </p>
        )}
      </div>

      {/* Quick Actions — show contextual actions based on member's pending items */}
      {loaded && (pendingSubs > 0 || profileComplete < 100 || unreadMessages > 0) && (
        <div className="flex flex-wrap gap-2">
          {pendingSubs > 0 && (
            <Link href="/dashboard/subscriptions">
              <Badge className="bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 cursor-pointer py-1.5 px-3 text-xs gap-1.5">
                <Wallet size={13} />{pendingSubs} subscription{pendingSubs > 1 ? "s" : ""} due — Pay now
              </Badge>
            </Link>
          )}
          {unreadMessages > 0 && (
            <Link href="/dashboard/messages">
              <Badge className="bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-200 cursor-pointer py-1.5 px-3 text-xs gap-1.5">
                <MessageCircle size={13} />{unreadMessages} unread message{unreadMessages > 1 ? "s" : ""}
              </Badge>
            </Link>
          )}
          {profileComplete < 100 && (
            <Link href="/dashboard/profile">
              <Badge className="bg-purple-100 text-purple-800 border border-purple-300 hover:bg-purple-200 cursor-pointer py-1.5 px-3 text-xs gap-1.5">
                <User size={13} />Profile {profileComplete}% complete — Update
              </Badge>
            </Link>
          )}
        </div>
      )}

      {/* Key Metrics */}
      {errors.stats ? (
        <SectionError message={t("dash.failed_stats")} onRetry={loadData} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label={t("dash.members")} value={`${stats.members} / 797`} subtitle={`${Math.round((stats.members / 797) * 100)}% ${t("dash.registered")} · ${797 - stats.members} ${t("dash.yet_to_join")}`} icon={UserCheck} loading={!loaded} borderColor="border-l-primary" iconColor="text-primary/40" subtitleColor="text-primary" />
          <MetricCard label={t("nav.announcements")} value={stats.announcements} subtitle={t("dash.published")} icon={Megaphone} loading={!loaded} borderColor="border-l-green-500" iconColor="text-green-500/40" subtitleColor="text-green-600" />
          <MetricCard label={t("nav.events")} value={stats.events} subtitle={t("dash.total_events")} icon={Calendar} loading={!loaded} borderColor="border-l-blue-500" iconColor="text-blue-500/40" subtitleColor="text-blue-600" />
          <MetricCard label={t("dash.my_contributions")} value={myContributions.count} subtitle={loaded ? `${formatMinutes(myContributions.minutes)} ${t("dash.this_month")}` : ""} icon={Award} loading={!loaded} borderColor="border-l-purple-500" iconColor="text-purple-500/40" subtitleColor="text-purple-600" />
        </div>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: t("nav.announcements"), icon: Megaphone, href: "/dashboard/announcements", color: "text-secondary" },
          { label: t("nav.events"), icon: Calendar, href: "/dashboard/events", color: "text-primary" },
          { label: t("nav.documents"), icon: FileText, href: "/dashboard/documents", color: "text-blue-600" },
          { label: t("nav.subscriptions"), icon: Wallet, href: "/dashboard/subscriptions", color: "text-amber-600", badge: pendingSubs > 0 ? `${pendingSubs} ${t("misc.due")}` : undefined },
          { label: t("nav.suggestions"), icon: Lightbulb, href: "/dashboard/suggestions", color: "text-yellow-600" },
          { label: t("nav.todos"), icon: ListTodo, href: "/dashboard/todos", color: "text-green-600" },
        ].map((item) => (
          <Link key={item.label} href={item.href}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="pt-3 pb-3 flex flex-col items-center text-center gap-1">
                <item.icon className={`w-6 h-6 ${item.color} opacity-60`} />
                <p className="text-xs font-medium">{item.label}</p>
                {item.badge && <Badge variant="outline" className="text-[9px] px-1.5">{item.badge}</Badge>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Top Contributors This Month */}
      {topContributors.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Trophy size={14} className="text-amber-500" /> {t("dash.top_contributors")}
              </h3>
              <Link href="/dashboard/contributions" className="text-xs text-primary hover:underline flex items-center gap-1">
                {t("dash.view_all")} <ArrowRight size={12} />
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {topContributors.map((c, i) => (
                <Badge key={c.name} variant="outline" className={`text-xs py-1 px-2.5 ${i === 0 ? "bg-amber-50 text-amber-800 border-amber-300" : i === 1 ? "bg-gray-50 text-gray-700 border-gray-300" : i === 2 ? "bg-orange-50 text-orange-700 border-orange-300" : ""}`}>
                  {i < 3 && <span className="mr-1">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>}
                  {c.name} <span className="ml-1 text-muted-foreground">({c.action_count})</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Feed */}
      {activityFeed.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity size={14} className="text-green-600" /> {t("dash.activity_feed")}
              </h3>
              <Link href="/dashboard/contributions" className="text-xs text-primary hover:underline flex items-center gap-1">
                {t("dash.view_all")} <ArrowRight size={12} />
              </Link>
            </div>
            <div className="space-y-2">
              {activityFeed.map((a) => {
                const firstName = a.user_name.split(" ").slice(0, 2).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
                return (
                  <div key={a.id} className="flex items-start gap-2.5 text-xs">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-primary font-semibold text-[10px]">{a.user_name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground">
                        <span className="font-medium">{firstName}</span>{" "}
                        <span className="text-muted-foreground">{ACTION_LABELS[a.action] || a.action.replace(/_/g, " ")}</span>
                      </p>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-[10px]">{timeAgo(a.created_at)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Birthdays */}
      {birthdays.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Cake size={14} className="text-pink-500" /> {t("dash.upcoming_birthdays")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {birthdays.map((b) => {
                const place = [b.block, b.district].filter(Boolean).join(", ");
                const subtitle = [b.designation, place].filter(Boolean).join(" • ");
                return (
                  <div
                    key={b.name}
                    className={`rounded-xl border px-3 py-2 ${b.isToday ? "bg-pink-50 border-pink-300" : "bg-muted/30 border-border"}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-lg leading-none mt-0.5">{b.isToday ? "🎂" : "🎈"}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${b.isToday ? "text-pink-700" : ""}`}>{b.name}</p>
                        {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {b.isToday ? "Today!" : `in ${b.daysUntil} day${b.daysUntil === 1 ? "" : "s"}`}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Poll */}
      {activePoll && (
        <Card className="border-primary/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 size={14} className="text-primary" /> {t("dash.quick_poll")}
              </h3>
              <Link href="/dashboard/polls" className="text-xs text-primary hover:underline flex items-center gap-1">
                {t("dash.all_polls")} <ArrowRight size={12} />
              </Link>
            </div>
            <p className="font-medium text-sm mb-3">{activePoll.title}</p>
            <div className="space-y-2">
              {activePoll.options.map((option, i) => {
                const votes = activePoll.voteCounts[i] || 0;
                const pct = activePoll.totalVotes > 0 ? Math.round((votes / activePoll.totalVotes) * 100) : 0;
                const isMyVote = activePoll.myVote === i;
                return (
                  <button
                    key={i}
                    onClick={() => handlePollVote(i)}
                    className={`w-full text-left rounded-xl p-2.5 relative overflow-hidden transition-all border ${
                      isMyVote
                        ? "border-primary/40 bg-primary/5"
                        : "border-transparent bg-muted/40 hover:bg-muted/60"
                    }`}
                  >
                    {/* Progress bar background */}
                    {activePoll.myVote !== null && (
                      <div
                        className={`absolute inset-y-0 left-0 transition-all duration-500 rounded-xl ${
                          isMyVote ? "bg-primary/10" : "bg-muted/50"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    )}
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {isMyVote && <Check size={14} className="text-primary shrink-0" />}
                        <span className="text-sm truncate">{option}</span>
                      </div>
                      {activePoll.myVote !== null && (
                        <span className={`text-xs font-medium shrink-0 ml-2 ${isMyVote ? "text-primary" : "text-muted-foreground"}`}>
                          {pct}%
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {activePoll.totalVotes > 0 && (
              <p className="text-xs text-muted-foreground mt-2">{activePoll.totalVotes} vote{activePoll.totalVotes !== 1 ? "s" : ""}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Today's Focus — top 3 active tasks for the user */}
      {loaded && (
        <Card className="border-primary/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ListTodo size={14} className="text-green-600" /> {t("dash.todays_focus")}
              </h3>
              <Link href="/dashboard/todos" className="text-xs text-primary hover:underline flex items-center gap-1">
                {t("dash.view_all")} <ArrowRight size={12} />
              </Link>
            </div>
            {todayTodos.length === 0 ? (
              <div className="text-center py-6">
                <ListTodo size={28} className="mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">{t("dash.no_active_tasks")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {todayTodos.map((todo) => {
                  const qLabel = todayQuadrantLabel(todo.urgent, todo.important);
                  const qColor = todayQuadrantColor(todo.urgent, todo.important);
                  const isInProgress = todo.status === "in_progress";
                  const dueLabel = todo.due_date
                    ? new Date(todo.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                    : null;
                  return (
                    <Link key={todo.id} href="/dashboard/todos" className="block">
                      <div className="rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors p-3 h-full flex flex-col">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 bg-background">
                            {todo.event_id}
                          </Badge>
                          {qLabel && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${qColor}`}>
                              {qLabel}
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${
                              isInProgress
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {isInProgress ? t("dash.task_in_progress") : t("dash.task_to_commit")}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium line-clamp-2 flex-1">{todo.title}</p>
                        {dueLabel && (
                          <p className="text-[11px] text-muted-foreground mt-1.5">
                            {t("dash.task_due")}: {dueLabel}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Announcements + Upcoming Events */}
      <div className="grid md:grid-cols-2 gap-4">
        {errors.announcements ? (
          <SectionError message={t("dash.failed_announcements")} onRetry={loadData} />
        ) : (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Megaphone size={14} className="text-accent" /> {t("dash.recent_announcements")}
                </h3>
                <Link href="/dashboard/announcements" className="text-xs text-primary hover:underline flex items-center gap-1">
                  {t("dash.view_all")} <ArrowRight size={12} />
                </Link>
              </div>
              <div className="space-y-3">
                {announcements.length === 0 ? (
                  <div className="text-center py-6">
                    <Megaphone size={28} className="mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">{t("dash.no_announcements")}</p>
                  </div>
                ) : (
                  announcements.map((a) => (
                    <div key={a.id} className="border-b last:border-0 pb-3 last:pb-0">
                      <h3 className="font-medium text-sm">{a.title}</h3>
                      <p
                        className="text-xs text-muted-foreground mt-1 line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(a.content) }}
                      />
                      <p className="text-xs text-muted-foreground mt-1">{formatDate(a.created_at)}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {errors.events ? (
          <SectionError message={t("dash.failed_events")} onRetry={loadData} />
        ) : (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Calendar size={14} className="text-secondary" /> {t("dash.upcoming_events")}
                </h3>
                <Link href="/dashboard/events" className="text-xs text-primary hover:underline flex items-center gap-1">
                  {t("dash.view_all")} <ArrowRight size={12} />
                </Link>
              </div>
              <div className="space-y-3">
                {events.length === 0 ? (
                  <div className="text-center py-6">
                    <Calendar size={28} className="mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">{t("dash.no_events")}</p>
                  </div>
                ) : (
                  events.map((ev) => (
                    <div key={ev.id} className="flex items-start gap-3 border-b last:border-0 pb-3 last:pb-0">
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-secondary/10 flex flex-col items-center justify-center">
                        <span className="text-xs font-medium text-secondary">
                          {new Date(ev.date).toLocaleDateString("en", { month: "short" })}
                        </span>
                        <span className="text-lg font-bold text-secondary leading-none">
                          {new Date(ev.date).getDate()}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-medium text-sm">{ev.title}</h3>
                        {ev.location && (
                          <Badge variant="outline" className="mt-1 text-xs">{ev.location}</Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* My Subscriptions + Admin Contacts */}
      <div className="grid md:grid-cols-2 gap-4">
        {errors.subscriptions ? (
          <SectionError message={t("dash.failed_subscriptions")} onRetry={loadData} />
        ) : (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <IndianRupee size={14} className="text-primary" /> {t("dash.my_subscriptions")}
                </h3>
                <Link href="/dashboard/subscriptions" className="text-xs text-primary hover:underline flex items-center gap-1">
                  {t("dash.view_all")} <ArrowRight size={12} />
                </Link>
              </div>
              <div className="space-y-2">
                {mySubscriptions.length === 0 ? (
                  <div className="text-center py-6">
                    <Wallet size={28} className="mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">{t("dash.no_subscriptions")}</p>
                  </div>
                ) : (
                  mySubscriptions.map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{displayPeriod(sub.period)}</p>
                        <p className="text-xs text-muted-foreground">
                          {sub.amount > 0 ? `₹${sub.amount.toLocaleString("en-IN")}` : "Amount not set"}
                          {sub.due_date && ` · Due ${formatDate(sub.due_date)}`}
                        </p>
                      </div>
                      <StatusBadge status={sub.status} />
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <AdminContacts contacts={adminContacts} />
      </div>
    </div>
  );
}
