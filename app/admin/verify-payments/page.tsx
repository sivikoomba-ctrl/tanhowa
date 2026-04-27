"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  ShieldCheck,
  IndianRupee,
  CheckCircle2,
  XCircle,
  Eye,
  Users,
  MapPin,
  Phone,
  ChevronDown,
  ChevronUp,
  Send,
  Upload,
  Loader2,
  Search,
  CreditCard,
  Hash,
  PauseCircle,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { fetchSignedPaymentProofUrl } from "@/lib/subscription-proofs";

interface Subscription {
  id: string;
  user_id: string;
  member_name: string;
  member_phone: string;
  period: string;
  amount: number;
  status: string;
  payment_proof_url: string | null;
  remarks: string | null;
  transaction_id: string | null;
  payment_method: string | null;
}

interface DistrictGroup {
  district: string;
  pending: number;
  totalAmount: number;
  officials: { id: string; name: string; email: string; phone: string }[];
  subscriptions: Subscription[];
}

function isDsVerified(sub: Subscription): boolean {
  return !!(sub.remarks?.startsWith("Provisionally approved.") || sub.remarks?.startsWith("Approved.") || sub.remarks?.startsWith("Verified by"));
}

function getDsApprover(sub: Subscription): string | null {
  const m = sub.remarks?.match(/^(?:Provisionally )?[Aa]pproved\.\s*-?\s*(.+?),\s*TANHOWA/);
  if (!m) return null;
  // Extract just the name (first part before comma)
  const parts = m[1].split(",").map((s) => s.trim());
  return parts[0];
}

export default function VerifyPaymentsPage() {
  const [districts, setDistricts] = useState<DistrictGroup[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedDistrict, setExpandedDistrict] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [user, setUser] = useState<{ role: string; official_type: string | null; name: string; designation: string; district: string; isSuperAdmin: boolean } | null>(null);
  const [nudgingDistrict, setNudgingDistrict] = useState<string | null>(null);
  const [uploadingSub, setUploadingSub] = useState<string | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<Subscription | null>(null);
  const [previewSub, setPreviewSub] = useState<Subscription | null>(null);
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [proofThumbnails, setProofThumbnails] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<Subscription | null>(null);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          const pd = d.user.posting_details || {};
          setUser({
            role: d.user.role,
            official_type: d.user.official_type,
            name: d.user.name || "",
            designation: (d.user.occupation || "") + (pd.official_designation ? ` / ${pd.official_designation}` : ""),
            district: pd.regular_district || "",
            isSuperAdmin: d.user.role === "super_admin",
          });
        }
      })
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterPeriod !== "all") params.set("period", filterPeriod);
      if (filterStatus !== "all") params.set("status", filterStatus);
      const res = await fetch(`/api/subscriptions/district-pending?${params}`);
      const data = await res.json();
      if (res.ok) {
        setDistricts(data.districts || []);
        setPeriods(data.periods || []);
        setTotalPending(data.totalPending || 0);
        setSelectedSubs(new Set());
      } else {
        toast.error(data.error || "Failed to load");
      }
    } catch {
      toast.error("Failed to load pending payments");
    } finally {
      setLoading(false);
    }
  }, [filterPeriod, filterStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load proof thumbnails for expanded district
  useEffect(() => {
    if (!expandedDistrict) return;
    const district = districts.find((d) => d.district === expandedDistrict);
    if (!district) return;
    for (const sub of district.subscriptions) {
      if (sub.payment_proof_url && !proofThumbnails[sub.id]) {
        fetchSignedPaymentProofUrl(sub.id, sub.payment_proof_url)
          .then((url) => setProofThumbnails((prev) => ({ ...prev, [sub.id]: url })))
          .catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedDistrict, districts]);

  function buildApprovalRemark() {
    const parts = [user?.name || "DS/DJS"];
    if (user?.designation) parts.push(user.designation);
    if (!user?.isSuperAdmin && user?.district) parts.push(user.district);
    parts.push("TANHOWA");
    const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const prefix = user?.isSuperAdmin ? "Approved." : "Provisionally approved.";
    return `${prefix} - ${parts.join(", ")}. (${dateStr})`;
  }

  async function handleDistrictVerify(sub: Subscription) {
    const remark = buildApprovalRemark();
    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sub.id, remarks: remark }),
    });
    if (res.ok) {
      toast.success(`Payment verified - forwarded to admin for approval`);
      loadData();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to verify");
    }
  }

  async function handleViewProof(sub: Subscription) {
    if (!sub.payment_proof_url) return;
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const signedUrl = await fetchSignedPaymentProofUrl(sub.id, sub.payment_proof_url);
      setPreviewUrl(signedUrl);
    } catch {
      toast.error("Failed to load proof image");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleNudge(district: DistrictGroup) {
    setNudgingDistrict(district.district);
    try {
      const res = await fetch("/api/subscriptions/nudge-officials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district: district.district,
          pendingCount: district.pending,
          totalAmount: district.totalAmount,
          officialIds: district.officials.map((o) => o.id),
        }),
      });
      if (res.ok) {
        toast.success(`Nudge sent to DS/DJS of ${district.district}`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to send nudge");
      }
    } catch {
      toast.error("Failed to send nudge");
    } finally {
      setNudgingDistrict(null);
    }
  }

  function triggerUpload(sub: Subscription) {
    uploadTargetRef.current = sub;
    fileInputRef.current?.click();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const sub = uploadTargetRef.current;
    if (!file || !sub) return;
    e.target.value = "";

    setUploadingSub(sub.id);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("subscription_id", sub.id);
      const res = await fetch("/api/upload/payment-proof", { method: "POST", body: formData });
      if (res.ok) {
        toast.success(`Proof uploaded for ${sub.member_name}`);
        loadData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploadingSub(null);
    }
  }

  async function handleStatusChange(sub: Subscription, status: string, remarks?: string) {
    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sub.id, status, ...(remarks ? { remarks } : {}) }),
    });
    if (res.ok) {
      toast.success(`Payment ${status === "paid" ? "approved" : status}`);
      loadData();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to update");
    }
  }

  async function handleDelete(sub: Subscription) {
    if (!confirm(`Delete subscription for ${sub.member_name} (${sub.period})?`)) return;
    const res = await fetch("/api/subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sub.id }),
    });
    if (res.ok) { toast.success("Deleted"); loadData(); }
    else toast.error("Failed to delete");
  }

  async function handleBatchVerify() {
    if (selectedSubs.size === 0) return;
    setBatchProcessing(true);
    let success = 0;
    for (const subId of selectedSubs) {
      // Find the sub
      let sub: Subscription | null = null;
      for (const d of districts) {
        sub = d.subscriptions.find((s) => s.id === subId) || null;
        if (sub) break;
      }
      if (!sub) continue;

      const remark = buildApprovalRemark();
      const res = await fetch("/api/subscriptions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sub.id, remarks: remark }),
      });
      if (res.ok) success++;
    }
    toast.success(`${success} payment(s) verified & forwarded`);
    setBatchProcessing(false);
    loadData();
  }

  function toggleSelection(subId: string) {
    setSelectedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  }

  function selectAllInDistrict(d: DistrictGroup) {
    const withProof = d.subscriptions.filter((s) => s.payment_proof_url && !isDsVerified(s));
    setSelectedSubs((prev) => {
      const next = new Set(prev);
      const allSelected = withProof.every((s) => next.has(s.id));
      for (const s of withProof) {
        if (allSelected) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });
  }

  const isStateOrAdmin = user?.official_type === "state" || user?.role === "admin" || user?.role === "super_admin";
  const isDistrictOfficial = user?.official_type === "district" && user?.role !== "admin" && user?.role !== "super_admin";

  const filteredDistricts = searchQuery.trim()
    ? districts.map((d) => {
        const q = searchQuery.trim().toLowerCase();
        const filtered = d.subscriptions.filter((s) => s.member_name.toLowerCase().includes(q) || s.member_phone.includes(q) || (s.transaction_id || "").toLowerCase().includes(q));
        return filtered.length > 0 ? { ...d, subscriptions: filtered, pending: filtered.length, totalAmount: filtered.reduce((sum, s) => sum + s.amount, 0) } : null;
      }).filter(Boolean) as DistrictGroup[]
    : districts;

  // Stats
  const totalVerified = districts.reduce((sum, d) => sum + d.subscriptions.filter((s) => isDsVerified(s)).length, 0);
  const totalWithProof = districts.reduce((sum, d) => sum + d.subscriptions.filter((s) => s.payment_proof_url).length, 0);
  const totalNoProof = districts.reduce((sum, d) => sum + d.subscriptions.filter((s) => !s.payment_proof_url).length, 0);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileUpload} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Verify Payments</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {isStateOrAdmin
                ? "Review and approve payment proofs across all districts"
                : "Verify payment proofs from your district members"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
            {totalPending} total
          </Badge>
          {totalVerified > 0 && (
            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
              {totalVerified} DS/DJS verified
            </Badge>
          )}
          {totalNoProof > 0 && (
            <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-300">
              {totalNoProof} no proof
            </Badge>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-28 sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Pending & Overdue</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="hold">Hold</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        {periods.length > 0 && (
          <Select value={filterPeriod} onValueChange={setFilterPeriod}>
            <SelectTrigger className="w-28 sm:w-36">
              <SelectValue placeholder="All periods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Periods</SelectItem>
              {periods.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Name, phone, txn ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-9 w-40 sm:w-52" />
        </div>

        {/* Batch action for DS/DJS */}
        {selectedSubs.size > 0 && !isStateOrAdmin && (
          <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1" disabled={batchProcessing} onClick={handleBatchVerify}>
            {batchProcessing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Verify {selectedSubs.size} Selected
          </Button>
        )}
      </div>

      {filteredDistricts.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle2 className="w-12 h-12 text-green-500/30 mx-auto mb-3" />
          <p className="text-muted-foreground">{searchQuery ? "No matching members found" : "No payments found"}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredDistricts.map((d) => {
            const verified = d.subscriptions.filter((s) => isDsVerified(s)).length;
            const withProof = d.subscriptions.filter((s) => s.payment_proof_url).length;
            const isExpanded = expandedDistrict === d.district;

            return (
              <Card key={d.district}>
                <CardHeader
                  className="cursor-pointer hover:bg-muted/30 transition-colors py-3"
                  onClick={() => setExpandedDistrict(isExpanded ? null : d.district)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <MapPin size={18} className="text-primary shrink-0" />
                      <div>
                        <CardTitle className="text-base">{d.district}</CardTitle>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users size={12} /> {d.pending}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <IndianRupee size={12} /> {d.totalAmount.toLocaleString("en-IN")}
                          </span>
                          {verified > 0 && (
                            <span className="text-xs text-green-600 flex items-center gap-1">
                              <CheckCircle2 size={12} /> {verified} verified
                            </span>
                          )}
                          {withProof < d.pending && (
                            <span className="text-xs text-red-600 flex items-center gap-1">
                              <AlertTriangle size={12} /> {d.pending - withProof} no proof
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isStateOrAdmin && d.officials.length > 0 && (
                        <div className="text-right mr-3 hidden sm:block">
                          {d.officials.map((o) => (
                            <div key={o.id} className="text-xs text-muted-foreground">
                              {o.name} <a href={`tel:${o.phone}`} className="text-primary hover:underline"><Phone size={10} className="inline" /> {o.phone}</a>
                            </div>
                          ))}
                        </div>
                      )}
                      {isStateOrAdmin && d.officials.length === 0 && (
                        <Badge variant="outline" className="text-xs text-red-600 border-red-300">No DS/DJS</Badge>
                      )}
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 space-y-2">
                    {/* District actions bar */}
                    <div className="flex items-center gap-2 pb-2 border-b flex-wrap">
                      {isStateOrAdmin && d.officials.length > 0 && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
                            const phones = d.officials.map((o) => o.phone).join(", ");
                            navigator.clipboard.writeText(phones);
                            toast.success(`Copied: ${phones}`);
                          }}>
                            <Phone size={12} /> Copy Phone(s)
                          </Button>
                          <Button size="sm" className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700" disabled={nudgingDistrict === d.district} onClick={(e) => { e.stopPropagation(); handleNudge(d); }}>
                            {nudgingDistrict === d.district ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                            Nudge DS/DJS
                          </Button>
                        </>
                      )}
                      {/* Select all for batch verify (DS/DJS only) */}
                      {isDistrictOfficial && d.subscriptions.some((s) => s.payment_proof_url && !isDsVerified(s)) && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => selectAllInDistrict(d)}>
                          Select All with Proof
                        </Button>
                      )}
                    </div>

                    {d.subscriptions.map((sub) => {
                      const verified = isDsVerified(sub);
                      const approver = getDsApprover(sub);
                      const hasProof = !!sub.payment_proof_url;
                      const thumbUrl = proofThumbnails[sub.id];

                      return (
                        <div
                          key={sub.id}
                          className={`flex flex-col sm:flex-row gap-3 p-3 rounded-lg border transition-colors ${
                            verified ? "border-green-300 bg-green-50/50" : hasProof ? "border-amber-200 bg-amber-50/30" : "border-red-200 bg-red-50/20"
                          }`}
                        >
                          {/* Checkbox for batch (DS/DJS) */}
                          {isDistrictOfficial && hasProof && !verified && (
                            <input
                              type="checkbox"
                              checked={selectedSubs.has(sub.id)}
                              onChange={() => toggleSelection(sub.id)}
                              className="mt-1 shrink-0 accent-primary"
                            />
                          )}

                          {/* Proof thumbnail */}
                          {thumbUrl && (
                            <div
                              className="w-14 h-14 shrink-0 rounded-lg overflow-hidden border cursor-pointer hover:ring-2 ring-primary/50"
                              onClick={() => { setVerifyTarget(null); setPreviewSub(sub); handleViewProof(sub); }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={thumbUrl} alt="Proof" className="w-full h-full object-cover" />
                            </div>
                          )}
                          {!thumbUrl && hasProof && (
                            <div
                              className="w-14 h-14 shrink-0 rounded-lg border bg-muted/50 flex items-center justify-center cursor-pointer hover:bg-muted"
                              onClick={() => { setVerifyTarget(null); setPreviewSub(sub); handleViewProof(sub); }}
                            >
                              <Eye size={16} className="text-muted-foreground" />
                            </div>
                          )}

                          {/* Member info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm">{sub.member_name}</p>
                              <Badge variant="outline" className={`text-[10px] ${
                                sub.status === "overdue" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}>
                                {sub.status}
                              </Badge>
                              {verified && (
                                <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">
                                  <CheckCircle2 size={10} className="mr-0.5" /> {approver || "DS/DJS"} verified
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                              {sub.member_phone && (
                                <a href={`tel:${sub.member_phone}`} className="flex items-center gap-0.5 hover:text-primary">
                                  <Phone size={10} /> {sub.member_phone}
                                </a>
                              )}
                              <span>{sub.period}</span>
                              <span className="font-semibold text-foreground flex items-center gap-0.5">
                                <IndianRupee size={10} /> {sub.amount.toLocaleString("en-IN")}
                              </span>
                            </div>
                            {/* Transaction details */}
                            {(sub.transaction_id || sub.payment_method) && (
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                {sub.transaction_id && (
                                  <span className="flex items-center gap-0.5"><Hash size={10} /> {sub.transaction_id}</span>
                                )}
                                {sub.payment_method && (
                                  <span className="flex items-center gap-0.5"><CreditCard size={10} /> {sub.payment_method}</span>
                                )}
                              </div>
                            )}
                            {/* Non-DS remarks */}
                            {sub.remarks && !verified && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">Note: {sub.remarks}</p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {/* View proof */}
                            {hasProof && (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setVerifyTarget(null); setPreviewSub(sub); handleViewProof(sub); }}>
                                <Eye size={12} /> Proof
                              </Button>
                            )}

                            {/* Upload / Re-upload */}
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50" disabled={uploadingSub === sub.id} onClick={() => triggerUpload(sub)}>
                              {uploadingSub === sub.id ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                              {hasProof ? "Re-upload" : "Upload"}
                            </Button>

                            {/* Primary action: Verify (DS/DJS) or View & Verify */}
                            {!verified && hasProof && (
                              <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 gap-1" onClick={() => { setVerifyTarget(sub); setPreviewSub(sub); handleViewProof(sub); }}>
                                <CheckCircle2 size={12} /> {isDistrictOfficial ? "Verify" : "View & Verify"}
                              </Button>
                            )}

                            {/* Status actions */}
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleStatusChange(sub, "hold", "Payment on hold for review.")}>
                              <PauseCircle size={12} /> Hold
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300 hover:bg-red-50 gap-1" onClick={() => {
                              const reason = prompt("Rejection reason:");
                              if (reason) handleStatusChange(sub, "rejected", reason);
                            }}>
                              <XCircle size={12} /> Reject
                            </Button>
                            {isStateOrAdmin && (
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300 hover:bg-red-50 gap-1" onClick={() => handleStatusChange(sub, "overdue")}>
                                <AlertTriangle size={12} /> Overdue
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 gap-1" onClick={() => handleDelete(sub)}>
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Proof Preview Dialog */}
      <Dialog open={!!previewUrl || previewLoading} onOpenChange={() => { setPreviewUrl(null); setPreviewLoading(false); setVerifyTarget(null); setPreviewSub(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle>Payment Proof</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0 space-y-3">
            {previewSub && (
              <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{previewSub.member_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {previewSub.member_phone} &middot; {previewSub.period}
                    {previewSub.transaction_id && <> &middot; Txn: {previewSub.transaction_id}</>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-green-700">{previewSub.amount.toLocaleString("en-IN")}</p>
                  <Badge variant="outline" className="text-[10px]">{previewSub.status}</Badge>
                </div>
              </div>
            )}
            {previewLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
            {previewUrl && (
              <div className="rounded-xl overflow-hidden border">
                {previewUrl.toLowerCase().includes(".pdf") ? (
                  <iframe src={previewUrl} className="w-full h-[70vh]" title="Payment Proof PDF" />
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Payment Proof" className="w-full" />
                  </>
                )}
              </div>
            )}
          </div>
          {previewUrl && (
            <div className="flex items-center justify-between gap-2 flex-wrap px-6 py-3 border-t bg-background">
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                Open in new tab
              </a>
              <div className="flex items-center gap-2">
                {verifyTarget && (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1" onClick={() => { handleDistrictVerify(verifyTarget); setPreviewUrl(null); setPreviewLoading(false); setVerifyTarget(null); }}>
                    <CheckCircle2 size={14} /> Confirm Verify & Forward
                  </Button>
                )}
                <Button size="sm" variant="outline" className="gap-1" onClick={() => { setPreviewUrl(null); setPreviewLoading(false); setVerifyTarget(null); setPreviewSub(null); }}>
                  <XCircle size={14} /> Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
