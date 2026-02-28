"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Megaphone, Calendar, FileText, UserCheck, UserX } from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    members: 0,
    announcements: 0,
    events: 0,
    documents: 0,
    pending: 0,
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/users?status=pending").then((r) => r.json()),
    ]).then(([s, p]) => {
      setStats({ ...s, pending: p.users?.length || 0 });
    });
  }, []);

  const cards = [
    { label: "Approved Members", value: stats.members, icon: UserCheck, color: "text-primary" },
    { label: "Pending Approvals", value: stats.pending, icon: UserX, color: "text-accent" },
    { label: "Announcements", value: stats.announcements, icon: Megaphone, color: "text-secondary" },
    { label: "Events", value: stats.events, icon: Calendar, color: "text-primary" },
    { label: "Documents", value: stats.documents, icon: FileText, color: "text-secondary" },
    { label: "Total Users", value: stats.members + stats.pending, icon: Users, color: "text-accent" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{c.label}</p>
                  <p className="text-3xl font-bold">{c.value}</p>
                </div>
                <c.icon className={`w-8 h-8 ${c.color} opacity-50`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
