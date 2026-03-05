"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Users, Megaphone, Calendar, FileText, UserCheck, UserX, Bell, Check, X, ArrowRight, Activity } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils";

interface PendingUser {
  id: string;
  name: string;
  email: string;
  occupation: string;
  created_at: string;
}

interface ActiveUser {
  id: string;
  name: string;
  email: string;
  photo_url: string;
  login_count: number;
  last_login_at: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    members: 0,
    announcements: 0,
    events: 0,
    documents: 0,
    pending: 0,
  });
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);

  function loadData() {
    Promise.all([
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/users?status=pending").then((r) => r.json()),
      fetch("/api/users?status=approved").then((r) => r.json()),
    ]).then(([s, p, a]) => {
      const users = p.users || [];
      setStats({ ...s, pending: users.length });
      setPendingUsers(users);
      const approved = (a.users || []) as ActiveUser[];
      const sorted = approved
        .filter((u: ActiveUser) => u.login_count > 0)
        .sort((a: ActiveUser, b: ActiveUser) => (b.login_count || 0) - (a.login_count || 0))
        .slice(0, 5);
      setActiveUsers(sorted);
    });
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleQuickAction(userId: string, action: "approve" | "reject") {
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action }),
    });
    if (res.ok) {
      toast.success(`Member ${action}d successfully`);
      loadData();
    } else {
      toast.error("Action failed");
    }
  }

  const cards = [
    { label: "Approved Members", value: stats.members, icon: UserCheck, color: "text-primary", href: "/admin/users" },
    { label: "Pending Approvals", value: stats.pending, icon: UserX, color: "text-accent", href: "/admin/users" },
    { label: "Announcements", value: stats.announcements, icon: Megaphone, color: "text-secondary", href: "/admin/announcements" },
    { label: "Events", value: stats.events, icon: Calendar, color: "text-primary", href: "/admin/events" },
    { label: "Documents", value: stats.documents, icon: FileText, color: "text-secondary", href: "/admin/documents" },
    { label: "Total Users", value: stats.members + stats.pending, icon: Users, color: "text-accent", href: "/admin/users" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      {/* Pending Members Alert Banner */}
      {pendingUsers.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100">
              <Bell className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-amber-900">
                {pendingUsers.length} New Member{pendingUsers.length > 1 ? "s" : ""} Awaiting Approval
              </h2>
              <p className="text-sm text-amber-700">Review and approve or reject pending membership requests</p>
            </div>
          </div>

          <div className="space-y-2">
            {pendingUsers.slice(0, 5).map((u) => (
              <div key={u.id} className="flex items-center justify-between bg-white rounded-lg p-3 shadow-sm">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{u.name || "Unnamed"}</p>
                    <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                      Pending
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {u.occupation && <span className="text-xs text-muted-foreground">{u.occupation}</span>}
                    <span className="text-xs text-muted-foreground">
                      Joined {formatDate(u.created_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <Button
                    size="sm"
                    onClick={() => handleQuickAction(u.id, "approve")}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <Check size={14} className="mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleQuickAction(u.id, "reject")}
                  >
                    <X size={14} className="mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {pendingUsers.length > 5 && (
            <Link href="/admin/users" className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-amber-700 hover:text-amber-900">
              View all {pendingUsers.length} pending members
              <ArrowRight size={14} />
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
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
          </Link>
        ))}
      </div>

      {/* Most Active Users */}
      {activeUsers.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Most Active Members</h2>
            </div>
            <div className="space-y-2">
              {activeUsers.map((u, i) => (
                <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                  <span className="text-sm font-bold text-muted-foreground w-5">{i + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {u.photo_url ? <img src={u.photo_url} alt={u.name} className="w-full h-full object-cover" /> : <span className="text-xs font-semibold text-primary">{u.name?.charAt(0)?.toUpperCase() || "?"}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name || "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{u.login_count} logins</p>
                    {u.last_login_at && <p className="text-xs text-muted-foreground">Last: {formatDateTime(u.last_login_at)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
