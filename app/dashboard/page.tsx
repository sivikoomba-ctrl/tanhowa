"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Calendar, Users, FileText } from "lucide-react";

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

export default function DashboardHome() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [stats, setStats] = useState({ members: 0, announcements: 0, events: 0, documents: 0 });

  useEffect(() => {
    fetch("/api/announcements?limit=3")
      .then((r) => r.json())
      .then((d) => setAnnouncements(d.announcements || []))
      .catch(() => {});
    fetch("/api/events?limit=3")
      .then((r) => r.json())
      .then((d) => setEvents(d.events || []))
      .catch(() => {});
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  }, []);

  const statCards = [
    { label: "Members", value: stats.members, icon: Users, color: "text-primary" },
    { label: "Announcements", value: stats.announcements, icon: Megaphone, color: "text-accent" },
    { label: "Events", value: stats.events, icon: Calendar, color: "text-secondary" },
    { label: "Documents", value: stats.documents, icon: FileText, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to TANHOWA</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
                <stat.icon className={`w-8 h-8 ${stat.color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent Announcements */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Megaphone className="w-5 h-5 text-accent" />
              Recent Announcements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {announcements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No announcements yet</p>
            ) : (
              announcements.map((a) => (
                <div key={a.id} className="border-b last:border-0 pb-3 last:pb-0">
                  <h3 className="font-medium text-sm">{a.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(a.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Upcoming Events */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="w-5 h-5 text-secondary" />
              Upcoming Events
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming events</p>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
