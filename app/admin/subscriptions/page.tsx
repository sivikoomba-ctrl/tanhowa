"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CreditCard,
  Search,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  IndianRupee,
  Users,
  Filter,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Subscription {
  id: string;
  user_id: string;
  period: string;
  amount: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  transaction_id: string | null;
  remarks: string | null;
  created_at: string;
  users?: { name: string; email: string; phone: string };
}

interface Stats {
  paid: number;
  pending: number;
  overdue: number;
  totalCollected: number;
}

const paymentMethods = ["Cash", "UPI", "Bank Transfer", "Cheque", "Online"];

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<Stats>({ paid: 0, pending: 0, overdue: 0, totalCollected: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");

  // Bulk create dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ period: "", amount: "", due_date: "" });
  const [bulkLoading, setBulkLoading] = useState(false);

  // Mark paid dialog
  const [payDialog, setPayDialog] = useState<Subscription | null>(null);
  const [payForm, setPayForm] = useState({ payment_method: "", transaction_id: "", remarks: "" });
  const [payLoading, setPayLoading] = useState(false);

  function load() {
    fetch("/api/subscriptions")
      .then((r) => r.json())
      .then((d) => {
        setSubscriptions(d.subscriptions || []);
        if (d.stats) setStats(d.stats);
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  const periods = useMemo(() => {
    const set = new Set(subscriptions.map((s) => s.period));
    return Array.from(set).sort().reverse();
  }, [subscriptions]);

  const filtered = useMemo(() => {
    return subscriptions.filter((sub) => {
      const matchesSearch =
        !searchQuery ||
        sub.users?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.users?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.users?.phone?.includes(searchQuery);
      const matchesStatus = filterStatus === "all" || sub.status === filterStatus;
      const matchesPeriod = filterPeriod === "all" || sub.period === filterPeriod;
      return matchesSearch && matchesStatus && matchesPeriod;
    });
  }, [subscriptions, searchQuery, filterStatus, filterPeriod]);

  async function handleBulkCreate(e: React.FormEvent) {
    e.preventDefault();
    setBulkLoading(true);
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "bulk-create",
        period: bulkForm.period,
        amount: parseFloat(bulkForm.amount) || 0,
        due_date: bulkForm.due_date || null,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(`Created ${data.count} subscription entries`);
      setBulkOpen(false);
      setBulkForm({ period: "", amount: "", due_date: "" });
      load();
    } else {
      toast.error(data.error || "Failed");
    }
    setBulkLoading(false);
  }

  async function handleMarkPaid(e: React.FormEvent) {
    e.preventDefault();
    if (!payDialog) return;
    setPayLoading(true);
    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: payDialog.id,
        status: "paid",
        payment_method: payForm.payment_method,
        transaction_id: payForm.transaction_id,
        remarks: payForm.remarks,
      }),
    });
    if (res.ok) {
      toast.success("Marked as paid");
      setPayDialog(null);
      setPayForm({ payment_method: "", transaction_id: "", remarks: "" });
      load();
    } else {
      toast.error("Failed to update");
    }
    setPayLoading(false);
  }

  async function handleMarkOverdue(id: string) {
    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "overdue" }),
    });
    if (res.ok) {
      toast.success("Marked as overdue");
      load();
    }
  }

  async function handleRevert(id: string) {
    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "pending" }),
    });
    if (res.ok) {
      toast.success("Reverted to pending");
      load();
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Subscriptions</h1>
            <p className="text-sm text-muted-foreground">Manage member subscription payments</p>
          </div>
        </div>
        <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-1" />
              New Subscription Period
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Subscription Period</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">This creates a pending subscription entry for every approved member.</p>
            <form onSubmit={handleBulkCreate} className="space-y-4">
              <div>
                <Label>Period Name *</Label>
                <Input
                  value={bulkForm.period}
                  onChange={(e) => setBulkForm({ ...bulkForm, period: e.target.value })}
                  placeholder="e.g. 2025-2026, Jan 2026, Lifetime"
                  required
                />
              </div>
              <div>
                <Label>Amount (&#8377;) *</Label>
                <Input
                  type="number"
                  value={bulkForm.amount}
                  onChange={(e) => setBulkForm({ ...bulkForm, amount: e.target.value })}
                  placeholder="500"
                  required
                />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={bulkForm.due_date}
                  onChange={(e) => setBulkForm({ ...bulkForm, due_date: e.target.value })}
                />
              </div>
              <Button type="submit" disabled={bulkLoading} className="w-full bg-primary hover:bg-primary/90">
                {bulkLoading ? "Creating..." : "Create for All Members"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Paid</p>
                <p className="text-2xl font-bold text-green-600">{stats.paid}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
              </div>
              <Clock className="w-8 h-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Collected</p>
                <p className="text-2xl font-bold">&#8377;{stats.totalCollected.toLocaleString("en-IN")}</p>
              </div>
              <IndianRupee className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Periods</SelectItem>
                  {periods.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">
            {subscriptions.length === 0
              ? "No subscriptions yet. Create a subscription period to get started."
              : "No subscriptions match your filters"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((sub) => (
            <Card key={sub.id} className={sub.status === "paid" ? "opacity-75" : ""}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm truncate">{sub.users?.name || "Unknown"}</h3>
                      <Badge
                        variant="outline"
                        className={
                          sub.status === "paid"
                            ? "bg-green-100 text-green-700 border-green-300"
                            : sub.status === "overdue"
                              ? "bg-red-100 text-red-700 border-red-300"
                              : "bg-amber-100 text-amber-700 border-amber-300"
                        }
                      >
                        {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{sub.users?.email} {sub.users?.phone && `| ${sub.users.phone}`}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">{sub.period}</Badge>
                      <span className="text-sm font-semibold">&#8377;{sub.amount?.toLocaleString("en-IN") || 0}</span>
                      {sub.due_date && <span className="text-xs text-muted-foreground">Due: {formatDate(sub.due_date)}</span>}
                      {sub.paid_at && <span className="text-xs text-green-600">Paid: {formatDate(sub.paid_at)}</span>}
                      {sub.payment_method && <span className="text-xs text-muted-foreground">via {sub.payment_method}</span>}
                      {sub.transaction_id && <span className="text-xs text-muted-foreground">#{sub.transaction_id}</span>}
                    </div>
                    {sub.remarks && <p className="text-xs text-muted-foreground mt-1">{sub.remarks}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {sub.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                          onClick={() => {
                            setPayDialog(sub);
                            setPayForm({ payment_method: "", transaction_id: "", remarks: "" });
                          }}
                        >
                          Mark Paid
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs"
                          onClick={() => handleMarkOverdue(sub.id)}
                        >
                          Overdue
                        </Button>
                      </>
                    )}
                    {sub.status === "overdue" && (
                      <>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                          onClick={() => {
                            setPayDialog(sub);
                            setPayForm({ payment_method: "", transaction_id: "", remarks: "" });
                          }}
                        >
                          Mark Paid
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleRevert(sub.id)}
                        >
                          Revert
                        </Button>
                      </>
                    )}
                    {sub.status === "paid" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleRevert(sub.id)}
                      >
                        Revert
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Mark Paid Dialog */}
      <Dialog open={!!payDialog} onOpenChange={(open) => !open && setPayDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {payDialog && (
            <div className="mb-2">
              <p className="text-sm font-medium">{payDialog.users?.name}</p>
              <p className="text-xs text-muted-foreground">{payDialog.period} &middot; &#8377;{payDialog.amount?.toLocaleString("en-IN")}</p>
            </div>
          )}
          <form onSubmit={handleMarkPaid} className="space-y-4">
            <div>
              <Label>Payment Method</Label>
              <Select value={payForm.payment_method} onValueChange={(val) => setPayForm({ ...payForm, payment_method: val })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Transaction ID / Receipt No.</Label>
              <Input
                value={payForm.transaction_id}
                onChange={(e) => setPayForm({ ...payForm, transaction_id: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Remarks</Label>
              <Textarea
                value={payForm.remarks}
                onChange={(e) => setPayForm({ ...payForm, remarks: e.target.value })}
                placeholder="Optional notes"
                rows={2}
              />
            </div>
            <Button type="submit" disabled={payLoading} className="w-full bg-green-600 hover:bg-green-700">
              {payLoading ? "Saving..." : "Confirm Payment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
