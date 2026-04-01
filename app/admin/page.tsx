"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Users, Megaphone, Calendar, FileText, UserCheck, Bell, Check, X,
  ArrowRight, Wallet, IndianRupee, CalendarDays,
  ListTodo, Award, TrendingUp, AlertTriangle,
} from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils";
import { MetricCard } from "@/components/metric-card";
import { AdminContacts } from "@/components/admin-contacts";
import { SectionError } from "@/components/section-error";

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

interface AdminContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  photo_url: string;
  occupation: string;
}

interface OverviewData {
  members: { total: number; pending: number; activeThisWeek: number; newThisMonth: number };
  subscriptions: { totalCollected: number; collectionRate: number; byPeriod: { period: string; paid: number; pending: number; overdue: number; collected: number; total: number }[] };
  tasks: { total: number; completionRate: number; breakdown: Record<string, number> };
  grievances: { total: number; suggestions: number; resolutionRate: number };
  contributions: { actionsThisMonth: number; minutesThisMonth: number };
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [stats, setStats] = useState({ totalCollection: 0, totalPayments: 0 });
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [adminContacts, setAdminContacts] = useState<AdminContact[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filteredCollection, setFilteredCollection] = useState<{ total: number; count: number } | null>(null);
  const [loadingPayments, setLoadingPayments] = useState(false);

  function loadData() {
    Promise.all([
      fetch("/api/reports/overview").then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/users?status=pending").then((r) => r.json()),
      fetch("/api/users?status=approved").then((r) => r.json()),
    ]).then(([ov, s, p, a]) => {
      setOverview(ov);
      setStats({ totalCollection: s.totalCollection || 0, totalPayments: s.totalPayments || 0 });
      setPendingUsers(p.users || []);
      setAdminContacts(s.admins || []);
      const approved = (a.users || []) as ActiveUser[];
      setActiveUsers(
        approved
          .filter((u: ActiveUser) => u.login_count > 0)
          .sort((a: ActiveUser, b: ActiveUser) => (b.login_count || 0) - (a.login_count || 0))
          .slice(0, 5)
      );
    }).catch(() => toast.error("Failed to load dashboard data"));
  }

  useEffect(() => { loadData(); }, []);

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

  async function fetchPaymentsByRange() {
    if (!fromDate || !toDate) return;
    setLoadingPayments(true);
    try {
      const res = await fetch(`/api/stats?from=${fromDate}&to=${toDate}`);
      const data = await res.json();
      setFilteredCollection({ total: data.totalCollection || 0, count: data.totalPayments || 0 });
    } catch {
      toast.error("Failed to fetch payment data");
    } finally {
      setLoadingPayments(false);
    }
  }

  const subsDue = overview ? overview.subscriptions.byPeriod.reduce((sum, p) => sum + p.pending + p.overdue, 0) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      {/* Pending Members Alert */}
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
            {pendingUsers.slice(0, 3).map((u) => (
              <div key={u.id} className="flex items-center justify-between bg-white rounded-lg p-3 shadow-sm">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{u.name || "Unnamed"}</p>
                    <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">Pending</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <Button size="sm" onClick={() => handleQuickAction(u.id, "approve")} className="bg-primary hover:bg-primary/90">
                    <Check size={14} className="mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleQuickAction(u.id, "reject")}>
                    <X size={14} className="mr-1" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {pendingUsers.length > 3 && (
            <Link href="/admin/users" className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-amber-700 hover:text-amber-900">
              View all {pendingUsers.length} pending <ArrowRight size={14} />
            </Link>
          )}
        </div>
      )}

      {/* Key Metrics — 4 highlight cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Members" value={overview?.members.total || 0} subtitle={`+${overview?.members.newThisMonth || 0} this month`} icon={UserCheck} loading={!overview} borderColor="border-l-primary" iconColor="text-primary/40" subtitleColor="text-green-600" />
        <MetricCard label="Collected" value={`₹${(overview?.subscriptions.totalCollected || 0).toLocaleString("en-IN")}`} subtitle={`${overview?.subscriptions.collectionRate || 0}% rate`} icon={IndianRupee} loading={!overview} borderColor="border-l-green-500" iconColor="text-green-500/40" subtitleColor="text-green-600" />
        <MetricCard label="Tasks" value={overview?.tasks.total || 0} subtitle={`${overview?.tasks.completionRate || 0}% completed`} icon={ListTodo} loading={!overview} borderColor="border-l-blue-500" iconColor="text-blue-500/40" subtitleColor="text-blue-600" />
        <MetricCard label="Contributions" value={overview?.contributions.actionsThisMonth || 0} subtitle={`${formatMinutes(overview?.contributions.minutesThisMonth || 0)} this month`} icon={Award} loading={!overview} borderColor="border-l-purple-500" iconColor="text-purple-500/40" subtitleColor="text-purple-600" />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: "Announcements", value: overview ? overview.members.total > 0 ? "View" : "0" : "...", icon: Megaphone, href: "/admin/announcements", color: "text-secondary" },
          { label: "Events", icon: Calendar, href: "/admin/events", color: "text-primary" },
          { label: "Documents", icon: FileText, href: "/admin/documents", color: "text-blue-600" },
          { label: "Subscriptions", icon: Wallet, href: "/admin/subscriptions", color: "text-amber-600", badge: subsDue > 0 ? `${subsDue} due` : undefined },
          { label: "Grievances", icon: AlertTriangle, href: "/admin/grievances", color: "text-red-600", badge: overview?.grievances.total ? `${overview.grievances.total}` : undefined },
          { label: "Reports", icon: TrendingUp, href: "/admin/reports", color: "text-green-600" },
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

      {/* Task Status + Grievances Row */}
      {overview && (
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><ListTodo size={14} /> Task Breakdown</h3>
              <div className="space-y-2">
                {Object.entries(overview.tasks.breakdown).map(([status, count]) => {
                  const labels: Record<string, { label: string; color: string }> = {
                    pending: { label: "Pending", color: "bg-amber-100 text-amber-700" },
                    approved: { label: "Approved", color: "bg-blue-100 text-blue-700" },
                    in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
                    completed: { label: "Completed", color: "bg-green-100 text-green-700" },
                    cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-700" },
                  };
                  const cfg = labels[status] || { label: status, color: "bg-gray-100 text-gray-700" };
                  return (
                    <div key={status} className="flex items-center justify-between">
                      <Badge variant="outline" className={`${cfg.color} text-xs`}>{cfg.label}</Badge>
                      <span className="text-sm font-semibold">{count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><AlertTriangle size={14} /> Grievances & Suggestions</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Grievances</span>
                  <span className="text-lg font-bold">{overview.grievances.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Suggestions</span>
                  <span className="text-lg font-bold">{overview.grievances.suggestions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Resolved</span>
                  <span className="text-lg font-bold text-green-700">{overview.grievances.resolutionRate}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Users size={14} /> Member Activity</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Active this week</span>
                  <span className="text-lg font-bold text-green-700">{overview.members.activeThisWeek}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">New this month</span>
                  <span className="text-lg font-bold text-blue-700">{overview.members.newThisMonth}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Pending approval</span>
                  <span className="text-lg font-bold text-amber-700">{overview.members.pending}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payment Collection & Admin Contacts */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-4">
              <IndianRupee className="w-5 h-5 text-primary" />
              <h2 className="text-sm font-semibold">Payment Collection</h2>
            </div>
            <div className="flex gap-3 mb-4">
              <div className="flex-1 rounded-xl bg-green-50 border border-green-200 p-3 text-center">
                <p className="text-xl font-bold text-green-700">{stats.totalPayments}</p>
                <p className="text-[10px] text-green-600">Total Payments</p>
              </div>
              <div className="flex-1 rounded-xl bg-green-50 border border-green-200 p-3 text-center">
                <p className="text-xl font-bold text-green-700">₹{stats.totalCollection.toLocaleString("en-IN")}</p>
                <p className="text-[10px] text-green-600">Total Collection</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs font-medium">Filter by Date Range</p>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="text-xs" />
                </div>
                <div className="flex-1">
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="text-xs" />
                </div>
              </div>
              <Button size="sm" onClick={fetchPaymentsByRange} disabled={!fromDate || !toDate || loadingPayments} className="w-full">
                {loadingPayments ? "Loading..." : "Show Collection"}
              </Button>
              {filteredCollection && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
                  <p className="text-xs text-muted-foreground mb-1">{formatDate(fromDate)} — {formatDate(toDate)}</p>
                  <p className="text-xl font-bold text-primary">₹{filteredCollection.total.toLocaleString("en-IN")}</p>
                  <p className="text-xs text-muted-foreground">{filteredCollection.count} payment{filteredCollection.count !== 1 ? "s" : ""}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <AdminContacts contacts={adminContacts} />
      </div>

      {/* Most Active Members */}
      {activeUsers.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><TrendingUp size={14} /> Most Active Members</h3>
              <Link href="/admin/contributions" className="text-xs text-primary hover:underline flex items-center gap-1">
                View Leaderboard <ArrowRight size={12} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              {activeUsers.map((u, i) => (
                <div key={u.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  <span className="text-xs font-bold text-muted-foreground w-4">#{i + 1}</span>
                  <Avatar className="w-7 h-7">
                    {u.photo_url && <AvatarImage src={u.photo_url} />}
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{u.name?.charAt(0)?.toUpperCase() || "?"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{u.name || "Unnamed"}</p>
                    <p className="text-[10px] text-muted-foreground">{u.login_count} logins</p>
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
