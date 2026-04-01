"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Users, Megaphone, Calendar, FileText, UserCheck, IndianRupee,
  Wallet, ListTodo, Award, Phone, Mail, Shield, Lightbulb,
  ArrowRight,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

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

interface AdminContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  photo_url: string;
  occupation: string;
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
  const [adminContacts, setAdminContacts] = useState<AdminContact[]>([]);
  const [mySubscriptions, setMySubscriptions] = useState<MySubscription[]>([]);
  const [myContributions, setMyContributions] = useState({ count: 0, minutes: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/announcements?limit=3").then((r) => r.json()),
      fetch("/api/events?limit=3").then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/subscriptions?me=true").then((r) => r.json()),
      fetch("/api/contributions?me=true&period=month").then((r) => r.json()),
    ]).then(([ann, ev, s, subs, contrib]) => {
      setAnnouncements(ann.announcements || []);
      setEvents(ev.events || []);
      setStats(s);
      setAdminContacts(s.admins || []);
      setMySubscriptions((subs.subscriptions || []).slice(0, 3));
      const contributions = contrib.contributions || [];
      const totalMinutes = contributions.reduce((sum: number, c: { estimated_minutes: number }) => sum + (c.estimated_minutes || 0), 0);
      setMyContributions({ count: contributions.length, minutes: totalMinutes });
    }).catch(() => toast.error("Failed to load dashboard data"))
      .finally(() => setLoaded(true));
  }, []);

  function formatMinutes(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  const pendingSubs = mySubscriptions.filter((s) => s.status === "pending" || s.status === "overdue").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {/* Key Metrics — 4 highlight cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Members</p>
                {loaded ? <p className="text-3xl font-bold">{stats.members}</p> : <Skeleton className="h-8 w-14 my-0.5" />}
                <p className="text-xs text-primary mt-1">Active members</p>
              </div>
              <UserCheck className="w-8 h-8 text-primary/40" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Announcements</p>
                {loaded ? <p className="text-3xl font-bold">{stats.announcements}</p> : <Skeleton className="h-8 w-14 my-0.5" />}
                <p className="text-xs text-green-600 mt-1">Published</p>
              </div>
              <Megaphone className="w-8 h-8 text-green-500/40" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Events</p>
                {loaded ? <p className="text-3xl font-bold">{stats.events}</p> : <Skeleton className="h-8 w-14 my-0.5" />}
                <p className="text-xs text-blue-600 mt-1">Total events</p>
              </div>
              <Calendar className="w-8 h-8 text-blue-500/40" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Contributions</p>
                {loaded ? <p className="text-3xl font-bold">{myContributions.count}</p> : <Skeleton className="h-8 w-14 my-0.5" />}
                <p className="text-xs text-purple-600 mt-1">{loaded ? `${formatMinutes(myContributions.minutes)} this month` : ""}</p>
              </div>
              <Award className="w-8 h-8 text-purple-500/40" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: "Announcements", icon: Megaphone, href: "/dashboard/announcements", color: "text-secondary" },
          { label: "Events", icon: Calendar, href: "/dashboard/events", color: "text-primary" },
          { label: "Documents", icon: FileText, href: "/dashboard/documents", color: "text-blue-600" },
          { label: "Subscriptions", icon: Wallet, href: "/dashboard/subscriptions", color: "text-amber-600", badge: pendingSubs > 0 ? `${pendingSubs} due` : undefined },
          { label: "Suggestions", icon: Lightbulb, href: "/dashboard/suggestions", color: "text-yellow-600" },
          { label: "Tasks", icon: ListTodo, href: "/dashboard/todos", color: "text-green-600" },
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

      {/* Recent Announcements + Upcoming Events */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Megaphone size={14} className="text-accent" /> Recent Announcements
              </h3>
              <Link href="/dashboard/announcements" className="text-xs text-primary hover:underline flex items-center gap-1">
                View All <ArrowRight size={12} />
              </Link>
            </div>
            <div className="space-y-3">
              {announcements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No announcements yet</p>
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

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Calendar size={14} className="text-secondary" /> Upcoming Events
              </h3>
              <Link href="/dashboard/events" className="text-xs text-primary hover:underline flex items-center gap-1">
                View All <ArrowRight size={12} />
              </Link>
            </div>
            <div className="space-y-3">
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No upcoming events</p>
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
      </div>

      {/* My Subscriptions + Admin Contacts */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <IndianRupee size={14} className="text-primary" /> My Subscriptions
              </h3>
              <Link href="/dashboard/subscriptions" className="text-xs text-primary hover:underline flex items-center gap-1">
                View All <ArrowRight size={12} />
              </Link>
            </div>
            <div className="space-y-2">
              {mySubscriptions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No subscriptions yet</p>
              ) : (
                mySubscriptions.map((sub) => {
                  const statusColors: Record<string, string> = {
                    paid: "bg-green-100 text-green-700",
                    pending: "bg-amber-100 text-amber-700",
                    overdue: "bg-red-100 text-red-700",
                    hold: "bg-gray-100 text-gray-700",
                    rejected: "bg-red-100 text-red-700",
                  };
                  return (
                    <div key={sub.id} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{sub.period}</p>
                        <p className="text-xs text-muted-foreground">
                          {sub.amount > 0 ? `₹${sub.amount.toLocaleString("en-IN")}` : "Amount not set"}
                          {sub.due_date && ` · Due ${formatDate(sub.due_date)}`}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-xs ${statusColors[sub.status] || ""}`}>
                        {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-sm font-semibold">Admin Contacts</h2>
            </div>
            <div className="space-y-2">
              {adminContacts.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                  <Avatar className="w-9 h-9">
                    {a.photo_url && <AvatarImage src={a.photo_url} alt={a.name} />}
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                      {a.name?.charAt(0)?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate uppercase">{a.name || "Admin"}</p>
                    {a.occupation && <p className="text-[10px] text-muted-foreground">{a.occupation}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 mt-0.5">
                      {a.phone && <a href={`tel:${a.phone}`} className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"><Phone size={9} /> {a.phone}</a>}
                      <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"><Mail size={9} /> {a.email}</a>
                    </div>
                  </div>
                </div>
              ))}
              {adminContacts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No admin contacts found</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
