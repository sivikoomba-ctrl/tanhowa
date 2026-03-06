"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Megaphone, Calendar, FileText, UserCheck, UserX, Bell, Check, X, ArrowRight, Activity, Wallet, IndianRupee, CalendarDays, Phone, Mail, Shield } from "lucide-react";
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

interface AdminContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  photo_url: string;
  occupation: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    members: 0,
    announcements: 0,
    events: 0,
    documents: 0,
    pending: 0,
    subscriptionsPending: 0,
    totalCollection: 0,
    totalPayments: 0,
  });
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [adminContacts, setAdminContacts] = useState<AdminContact[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filteredCollection, setFilteredCollection] = useState<{ total: number; count: number } | null>(null);
  const [loadingPayments, setLoadingPayments] = useState(false);

  function loadData() {
    Promise.all([
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/users?status=pending").then((r) => r.json()),
      fetch("/api/users?status=approved").then((r) => r.json()),
      fetch("/api/subscriptions").then((r) => r.json()).catch(() => ({})),
    ]).then(([s, p, a, sub]) => {
      const users = p.users || [];
      const subStats = sub.stats || {};
      setStats({
        ...s,
        pending: users.length,
        subscriptionsPending: (subStats.pending || 0) + (subStats.overdue || 0),
        totalCollection: s.totalCollection || 0,
        totalPayments: s.totalPayments || 0,
      });
      setPendingUsers(users);
      setAdminContacts(s.admins || []);
      const approved = (a.users || []) as ActiveUser[];
      const sorted = approved
        .filter((u: ActiveUser) => u.login_count > 0)
        .sort((a: ActiveUser, b: ActiveUser) => (b.login_count || 0) - (a.login_count || 0))
        .slice(0, 5);
      setActiveUsers(sorted);
    }).catch(() => {});
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

  const cards = [
    { label: "Approved Members", value: stats.members, icon: UserCheck, color: "text-primary", href: "/admin/users" },
    { label: "Pending Approvals", value: stats.pending, icon: UserX, color: "text-accent", href: "/admin/users" },
    { label: "Announcements", value: stats.announcements, icon: Megaphone, color: "text-secondary", href: "/admin/announcements" },
    { label: "Events", value: stats.events, icon: Calendar, color: "text-primary", href: "/admin/events" },
    { label: "Document Vault", value: stats.documents, icon: FileText, color: "text-secondary", href: "/admin/documents" },
    { label: "Subscriptions Due", value: stats.subscriptionsPending, icon: Wallet, color: "text-accent", href: "/admin/subscriptions" },
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

      {/* Payment Collection & Admin Contacts */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Payment Collection with Date Range */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-4">
              <IndianRupee className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Payment Collection</h2>
            </div>

            {/* Overall stats */}
            <div className="flex gap-4 mb-4">
              <div className="flex-1 rounded-xl bg-green-50 border border-green-200 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{stats.totalPayments}</p>
                <p className="text-xs text-green-600">Total Payments</p>
              </div>
              <div className="flex-1 rounded-xl bg-green-50 border border-green-200 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">₹{stats.totalCollection.toLocaleString("en-IN")}</p>
                <p className="text-xs text-green-600">Total Collection</p>
              </div>
            </div>

            {/* Date range filter */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">Filter by Date Range</p>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">From</label>
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">To</label>
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
              </div>
              <Button
                size="sm"
                onClick={fetchPaymentsByRange}
                disabled={!fromDate || !toDate || loadingPayments}
                className="w-full"
              >
                {loadingPayments ? "Loading..." : "Show Collection"}
              </Button>

              {filteredCollection && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    {formatDate(fromDate)} — {formatDate(toDate)}
                  </p>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xl font-bold text-primary">₹{filteredCollection.total.toLocaleString("en-IN")}</p>
                      <p className="text-xs text-muted-foreground">{filteredCollection.count} payment{filteredCollection.count !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Admin Contacts */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Admin Contacts</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">Reach out to these admins for any help or queries.</p>
            <div className="space-y-3">
              {adminContacts.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                  <Avatar className="w-10 h-10">
                    {a.photo_url && <AvatarImage src={a.photo_url} alt={a.name} />}
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                      {a.name?.charAt(0)?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate uppercase">{a.name || "Admin"}</p>
                    {a.occupation && <p className="text-xs text-muted-foreground">{a.occupation}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      {a.phone && (
                        <a href={`tel:${a.phone}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <Phone size={10} /> {a.phone}
                        </a>
                      )}
                      <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <Mail size={10} /> {a.email}
                      </a>
                    </div>
                  </div>
                </div>
              ))}
              {adminContacts.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No admin contacts found</p>
              )}
            </div>
          </CardContent>
        </Card>
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
