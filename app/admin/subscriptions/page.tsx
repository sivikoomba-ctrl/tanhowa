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
  Wallet,
  Search,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  IndianRupee,
  Users,
  Filter,
  ImageIcon,
  Eye,
  QrCode,
  Upload,
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
  payment_proof_url: string | null;
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

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 5 }, (_, i) => String(currentYear + i));

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<Stats>({ paid: 0, pending: 0, overdue: 0, totalCollected: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");

  // Bulk create dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ period: String(currentYear), amount: "", due_date: "" });
  const [bulkLoading, setBulkLoading] = useState(false);

  // Verify payment dialog
  const [payDialog, setPayDialog] = useState<Subscription | null>(null);
  const [payForm, setPayForm] = useState({ remarks: "", payment_date: "", payment_time: "", verified_email: "" });
  const [payLoading, setPayLoading] = useState(false);
  const [payProofUrl, setPayProofUrl] = useState<string | null>(null);

  // Proof preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // QR code
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrUploading, setQrUploading] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);

  function load() {
    fetch("/api/subscriptions")
      .then((r) => r.json())
      .then((d) => {
        setSubscriptions(d.subscriptions || []);
        if (d.stats) setStats(d.stats);
      })
      .catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings || {};
        if (s.payment_qr_url) setQrUrl(s.payment_qr_url);
      })
      .catch(() => {});
  }

  async function handleQrUpload(file: File) {
    setQrUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload/qr-code", { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok) {
      setQrUrl(data.url);
      toast.success("QR code uploaded successfully");
      setQrDialogOpen(false);
    } else {
      toast.error(data.error || "Upload failed");
    }
    setQrUploading(false);
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
        sub.users?.phone?.includes(searchQuery) ||
        sub.transaction_id?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "proof-uploaded" ? !!sub.payment_proof_url && sub.status !== "paid" : sub.status === filterStatus);
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
      toast.success(`Created ${data.count} subscription entries for ${bulkForm.period}`);
      setBulkOpen(false);
      setBulkForm({ period: String(currentYear), amount: "", due_date: "" });
      load();
    } else {
      toast.error(data.error || "Failed");
    }
    setBulkLoading(false);
  }

  async function handleVerifyPaid(e: React.FormEvent) {
    e.preventDefault();
    if (!payDialog) return;
    setPayLoading(true);

    // Build paid_at from admin-entered date & time
    let paidAt: string | undefined;
    if (payForm.payment_date) {
      const time = payForm.payment_time || "12:00";
      paidAt = new Date(`${payForm.payment_date}T${time}:00`).toISOString();
    }

    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: payDialog.id,
        status: "paid",
        remarks: payForm.remarks || payDialog.remarks,
        paid_at: paidAt,
      }),
    });
    if (res.ok) {
      toast.success("Payment verified and marked as paid");
      setPayDialog(null);
      setPayForm({ remarks: "", payment_date: "", payment_time: "", verified_email: "" });
      load();
    } else {
      toast.error("Failed to update");
    }
    setPayLoading(false);
  }

  async function viewProof(sub: Subscription) {
    if (!sub.payment_proof_url) return;
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/upload/payment-proof/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: sub.payment_proof_url, subscription_id: sub.id }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setPreviewUrl(data.url);
      } else {
        toast.error("Failed to load proof");
      }
    } catch {
      toast.error("Failed to load proof");
    }
    setPreviewLoading(false);
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
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Subscriptions</h1>
            <p className="text-sm text-muted-foreground">Manage yearly member subscription payments</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <QrCode size={16} className="mr-1" />
                {qrUrl ? "Update QR" : "Upload QR"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Payment QR Code</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">Upload the UPI/bank payment QR code image. Members will see this on their subscriptions page.</p>
              {qrUrl && (
                <div className="rounded-xl overflow-hidden border">
                  <img src={qrUrl} alt="Current QR code" className="w-full max-w-[250px] mx-auto" />
                  <p className="text-xs text-center text-muted-foreground py-2">Current QR code</p>
                </div>
              )}
              <div className="space-y-3">
                <Label>Select QR Code Image</Label>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={qrUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleQrUpload(file);
                  }}
                />
                {qrUploading && <p className="text-sm text-muted-foreground">Uploading...</p>}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90">
                <Plus size={16} className="mr-1" />
                New Year Subscription
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Yearly Subscription</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">This creates a pending subscription entry for every approved member for the selected year.</p>
            <form onSubmit={handleBulkCreate} className="space-y-4">
              <div>
                <Label>Year *</Label>
                <Select value={bulkForm.period} onValueChange={(val) => setBulkForm({ ...bulkForm, period: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                placeholder="Search by name, email, phone, or transaction ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="proof-uploaded">Proof Uploaded (Awaiting Approval)</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {periods.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">
            {subscriptions.length === 0
              ? "No subscriptions yet. Create a yearly subscription to get started."
              : "No subscriptions match your filters"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((sub) => {
            const hasProof = !!sub.payment_proof_url;
            return (
              <Card key={sub.id} className={sub.status === "paid" ? "opacity-75" : hasProof && sub.status !== "paid" ? "border-blue-200 bg-blue-50/30" : ""}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
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
                        {hasProof && sub.status !== "paid" && (
                          <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300 text-[10px]">
                            Proof Uploaded
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{sub.users?.email} {sub.users?.phone && `| ${sub.users.phone}`}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">{sub.period}</Badge>
                        <span className="text-sm font-semibold">&#8377;{sub.amount?.toLocaleString("en-IN") || 0}</span>
                        {sub.due_date && <span className="text-xs text-muted-foreground">Due: {formatDate(sub.due_date)}</span>}
                        {sub.paid_at && <span className="text-xs text-green-600">Verified: {formatDate(sub.paid_at)}</span>}
                      </div>
                      {sub.transaction_id && (
                        <p className="text-xs text-muted-foreground mt-1">Txn ID: <span className="font-mono">{sub.transaction_id}</span></p>
                      )}
                      {sub.payment_method && (
                        <p className="text-xs text-muted-foreground">Method: {sub.payment_method}</p>
                      )}
                      {sub.remarks && <p className="text-xs text-muted-foreground">Note: {sub.remarks}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {hasProof && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => viewProof(sub)}
                        >
                          <Eye size={12} className="mr-1" />
                          View Proof
                        </Button>
                      )}
                      {(sub.status === "pending" || sub.status === "overdue") && (
                        <>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                            onClick={async () => {
                              setPayDialog(sub);
                              const today = new Date();
                              setPayForm({
                                remarks: "",
                                payment_date: today.toISOString().split("T")[0],
                                payment_time: today.toTimeString().slice(0, 5),
                                verified_email: sub.users?.email || "",
                              });
                              setPayProofUrl(null);
                              if (sub.payment_proof_url) {
                                const res = await fetch("/api/upload/payment-proof/signed-url", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ file_path: sub.payment_proof_url, subscription_id: sub.id }),
                                });
                                const data = await res.json();
                                if (res.ok && data.url) setPayProofUrl(data.url);
                              }
                            }}
                          >
                            Verify & Approve
                          </Button>
                          {sub.status === "pending" && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs"
                              onClick={() => handleMarkOverdue(sub.id)}
                            >
                              Mark Overdue
                            </Button>
                          )}
                          {sub.status === "overdue" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => handleRevert(sub.id)}
                            >
                              Revert
                            </Button>
                          )}
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
            );
          })}
        </div>
      )}

      {/* Verify Payment Dialog */}
      <Dialog open={!!payDialog} onOpenChange={(open) => !open && setPayDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Verify & Approve Payment</DialogTitle>
          </DialogHeader>
          {payDialog && (
            <div className="space-y-5">
              {/* Member Info Section */}
              <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Member Details</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name</span>
                    <p className="font-medium">{payDialog.users?.name || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email</span>
                    <p className="font-medium">{payDialog.users?.email || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Phone</span>
                    <p className="font-medium">{payDialog.users?.phone || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Subscription</span>
                    <p className="font-medium">{payDialog.period} — &#8377;{payDialog.amount?.toLocaleString("en-IN")}</p>
                  </div>
                </div>
              </div>

              {/* Member-Submitted Payment Info */}
              <div className="rounded-xl border bg-blue-50/50 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Member-Submitted Details (cross-verify with proof)</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Transaction ID</span>
                    <p className="font-mono font-medium">{payDialog.transaction_id || <span className="text-amber-600 italic">Not provided</span>}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Payment Method</span>
                    <p className="font-medium">{payDialog.payment_method || <span className="text-amber-600 italic">Not provided</span>}</p>
                  </div>
                  {payDialog.remarks && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Member Note</span>
                      <p className="font-medium">{payDialog.remarks}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Proof Image */}
              {payDialog.payment_proof_url && payProofUrl && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Payment Proof Image</h3>
                  <div className="rounded-xl overflow-hidden border bg-white">
                    <img src={payProofUrl} alt="Payment proof" className="w-full" />
                  </div>
                </div>
              )}
              {payDialog.payment_proof_url && !payProofUrl && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading proof image...</span>
                </div>
              )}
              {!payDialog.payment_proof_url && (
                <div className="flex items-center gap-2 p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <ImageIcon className="w-5 h-5 text-amber-600" />
                  <p className="text-sm text-amber-700 font-medium">No payment proof uploaded by member</p>
                </div>
              )}

              {/* Admin Verification Form */}
              <form onSubmit={handleVerifyPaid} className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Admin Verification</h3>

                <div>
                  <Label>Member Email (confirm identity) *</Label>
                  <Input
                    value={payForm.verified_email}
                    onChange={(e) => setPayForm({ ...payForm, verified_email: e.target.value })}
                    placeholder="Enter member's email"
                    required
                  />
                  {payForm.verified_email && payForm.verified_email !== payDialog.users?.email && (
                    <p className="text-xs text-red-600 mt-1 font-medium">Email does not match member record ({payDialog.users?.email})</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Payment Date *</Label>
                    <Input
                      type="date"
                      value={payForm.payment_date}
                      onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Payment Time</Label>
                    <Input
                      type="time"
                      value={payForm.payment_time}
                      onChange={(e) => setPayForm({ ...payForm, payment_time: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label>Admin Remarks (optional)</Label>
                  <Textarea
                    value={payForm.remarks}
                    onChange={(e) => setPayForm({ ...payForm, remarks: e.target.value })}
                    placeholder="Any notes about the verification"
                    rows={2}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={payLoading || (payForm.verified_email !== payDialog.users?.email)}
                  className="w-full bg-green-600 hover:bg-green-700 h-11 text-base"
                >
                  {payLoading ? "Verifying..." : "Confirm Payment Received"}
                </Button>
                {payForm.verified_email && payForm.verified_email !== payDialog.users?.email && (
                  <p className="text-xs text-red-500 text-center">Cannot approve — email mismatch. Please verify the correct member.</p>
                )}
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Proof Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment Proof</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="rounded-xl overflow-hidden border">
              <img src={previewUrl} alt="Payment proof" className="w-full" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
