"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
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
}

interface DistrictGroup {
  district: string;
  pending: number;
  totalAmount: number;
  officials: { id: string; name: string; email: string; phone: string }[];
  subscriptions: Subscription[];
}

export default function VerifyPaymentsPage() {
  const [districts, setDistricts] = useState<DistrictGroup[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [expandedDistrict, setExpandedDistrict] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [user, setUser] = useState<{ role: string; official_type: string | null; name: string } | null>(null);
  const [nudgingDistrict, setNudgingDistrict] = useState<string | null>(null);
  const [uploadingSub, setUploadingSub] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<Subscription | null>(null);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ? { role: d.user.role, official_type: d.user.official_type, name: d.user.name || "" } : null))
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterPeriod !== "all") params.set("period", filterPeriod);
      const res = await fetch(`/api/subscriptions/district-pending?${params}`);
      const data = await res.json();
      if (res.ok) {
        setDistricts(data.districts || []);
        setPeriods(data.periods || []);
        setTotalPending(data.totalPending || 0);
      } else {
        toast.error(data.error || "Failed to load");
      }
    } catch {
      toast.error("Failed to load pending payments");
    } finally {
      setLoading(false);
    }
  }, [filterPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleDistrictVerify(sub: Subscription) {
    const officialName = user?.name || "DS/DJS";
    const remark = `Verified by ${officialName} on ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;
    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sub.id, remarks: remark }),
    });
    if (res.ok) {
      toast.success(`Payment verified — forwarded to admin for approval`);
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

  const isStateOrAdmin = user?.official_type === "state" || user?.role === "admin" || user?.role === "super_admin";

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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Verify Payments</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {isStateOrAdmin
                ? "Proofs pending district-level verification"
                : "Verify payment proofs from your district"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs sm:text-sm bg-amber-50 text-amber-700 border-amber-300">
            {totalPending} pending
          </Badge>
          {periods.length > 0 && (
            <Select value={filterPeriod} onValueChange={setFilterPeriod}>
              <SelectTrigger className="w-32 sm:w-40">
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
        </div>
      </div>

      {districts.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle2 className="w-12 h-12 text-green-500/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No pending payments with uploaded proofs</p>
        </div>
      ) : (
        <div className="space-y-4">
          {districts.map((d) => (
            <Card key={d.district}>
              <CardHeader
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedDistrict(expandedDistrict === d.district ? null : d.district)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MapPin size={18} className="text-primary" />
                    <div>
                      <CardTitle className="text-base">{d.district}</CardTitle>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users size={12} /> {d.pending} pending
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <IndianRupee size={12} /> ₹{d.totalAmount.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isStateOrAdmin && d.officials.length > 0 && (
                      <div className="text-right mr-3">
                        {d.officials.map((o) => (
                          <div key={o.id} className="text-xs text-muted-foreground">
                            {o.name} <a href={`tel:${o.phone}`} className="text-primary hover:underline"><Phone size={10} className="inline" /> {o.phone}</a>
                          </div>
                        ))}
                      </div>
                    )}
                    {isStateOrAdmin && d.officials.length === 0 && (
                      <Badge variant="outline" className="text-xs text-red-600 border-red-300">No DS/DJS assigned</Badge>
                    )}
                    {expandedDistrict === d.district ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>
              </CardHeader>

              {expandedDistrict === d.district && (
                <CardContent className="pt-0 space-y-3">
                  {/* DS/DJS actions for state officials / admins */}
                  {isStateOrAdmin && d.officials.length > 0 && (
                    <div className="flex items-center gap-2 pb-2 border-b">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1"
                        onClick={() => {
                          const phones = d.officials.map((o) => o.phone).join(", ");
                          navigator.clipboard.writeText(phones);
                          toast.success(`Copied: ${phones}`);
                        }}
                      >
                        <Phone size={12} /> Copy DS/DJS phone(s)
                      </Button>
                      <Button
                        size="sm"
                        className="text-xs gap-1 bg-amber-600 hover:bg-amber-700"
                        disabled={nudgingDistrict === d.district}
                        onClick={(e) => { e.stopPropagation(); handleNudge(d); }}
                      >
                        {nudgingDistrict === d.district ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                        Nudge DS/DJS
                      </Button>
                    </div>
                  )}

                  {d.subscriptions.map((sub) => (
                    <div key={sub.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{sub.member_name}</p>
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            {sub.status}
                          </Badge>
                          {sub.remarks?.startsWith("Verified by") && (
                            <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">
                              <CheckCircle2 size={10} className="mr-0.5" /> DS/DJS Verified
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          {sub.member_phone && <span className="flex items-center gap-0.5"><Phone size={10} /> {sub.member_phone}</span>}
                          <span>{sub.period}</span>
                          <span className="font-medium text-foreground flex items-center gap-0.5">
                            <IndianRupee size={10} /> ₹{sub.amount.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {sub.payment_proof_url ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleViewProof(sub)}>
                            <Eye size={12} /> Proof
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
                            disabled={uploadingSub === sub.id}
                            onClick={() => triggerUpload(sub)}
                          >
                            {uploadingSub === sub.id ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                            Upload Proof
                          </Button>
                        )}
                        {sub.remarks?.startsWith("Verified by") ? (
                          <Badge className="text-xs bg-green-50 text-green-700 border-green-300 py-1 px-2">
                            <CheckCircle2 size={12} className="mr-1" /> Verified
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-green-600 hover:bg-green-700 gap-1"
                            disabled={!sub.payment_proof_url}
                            title={!sub.payment_proof_url ? "Upload proof before verifying" : ""}
                            onClick={() => handleDistrictVerify(sub)}
                          >
                            <CheckCircle2 size={12} /> Verify
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Proof Preview */}
      <Dialog open={!!previewUrl || previewLoading} onOpenChange={() => { setPreviewUrl(null); setPreviewLoading(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment Proof</DialogTitle>
          </DialogHeader>
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
          {previewUrl && (
            <div className="flex justify-end">
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                Open in new tab
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
