"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Megaphone, Calendar, FileText, UserCheck,
  Wallet, ListTodo, Award, Lightbulb, IndianRupee,
  ArrowRight, Trophy, Cake, MessageCircle, User,
  Flame, Sun, Moon, CloudSun,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MetricCard } from "@/components/metric-card";
import { AdminContacts } from "@/components/admin-contacts";
import { StatusBadge } from "@/components/status-badge";
import { SectionError } from "@/components/section-error";
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

export default function DashboardHome() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [stats, setStats] = useState({ members: 0, announcements: 0, events: 0, documents: 0 });
  const [adminContacts, setAdminContacts] = useState<{ id: string; name: string; email: string; phone: string; photo_url: string; occupation: string }[]>([]);
  const [mySubscriptions, setMySubscriptions] = useState<MySubscription[]>([]);
  const [myContributions, setMyContributions] = useState({ count: 0, minutes: 0 });
  const [topContributors, setTopContributors] = useState<{ name: string; action_count: number; total_minutes: number }[]>([]);
  const [birthdays, setBirthdays] = useState<{ name: string; isToday: boolean; daysUntil: number }[]>([]);
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [profileComplete, setProfileComplete] = useState(100);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [streak, setStreak] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const t = useT();
  const greeting = getGreeting();

  function loadData() {
    setLoaded(false);
    setErrors({});

    // Fetch user info + profile completeness
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
  }

  useEffect(() => { loadData(); }, []);

  function formatMinutes(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  const isSuperAdmin = userRole === "super_admin";
  const pendingSubs = isSuperAdmin ? 0 : mySubscriptions.filter((s) => s.status === "pending" || s.status === "overdue").length;

  return (
    <div className="space-y-6">
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

      {/* Upcoming Birthdays */}
      {birthdays.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Cake size={14} className="text-pink-500" /> {t("dash.upcoming_birthdays")}
            </h3>
            <div className="flex flex-wrap gap-2">
              {birthdays.map((b) => (
                <Badge key={b.name} variant="outline" className={`text-xs py-1 px-2.5 ${b.isToday ? "bg-pink-50 text-pink-700 border-pink-300" : ""}`}>
                  {b.isToday ? "🎂 " : "🎈 "}{b.name}
                  {b.isToday ? " — Today!" : ` — in ${b.daysUntil}d`}
                </Badge>
              ))}
            </div>
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
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.content}</p>
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
                        <p className="text-sm font-medium truncate">{sub.period}</p>
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
