"use client";

import { useState, useEffect } from "react";
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
  Bell,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Subscription {
  id: string;
  user_id: string;
  member_name: string;
  member_phone: string;
  period: string;
  amount: number;
  status: string;
  payment_proof_url: string | null;
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
  const [user, setUser] = useState<{ role: string; official_type: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ? { role: d.user.role, official_type: d.user.official_type } : null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [filterPeriod]);

  async function loadData() {
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
  }

  async function handleVerify(subId: string, status: "paid" | "rejected") {
    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: subId, status }),
    });
    if (res.ok) {
      toast.success(`Payment ${status === "paid" ? "approved" : "rejected"}`);
      loadData();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to update");
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Verify Payments</h1>
            <p className="text-sm text-muted-foreground">
              {isStateOrAdmin
                ? "Members with uploaded proofs pending district-level verification"
                : "Verify payment proofs from members in your district"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm bg-amber-50 text-amber-700 border-amber-300">
            {totalPending} pending
          </Badge>
          {periods.length > 0 && (
            <Select value={filterPeriod} onValueChange={setFilterPeriod}>
              <SelectTrigger className="w-40">
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
                    {/* Show DS/DJS for this district (state/admin view) */}
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
                  {/* Notify button for state officials */}
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
                      <span className="text-xs text-muted-foreground">Notify them to verify {d.pending} pending payment(s)</span>
                    </div>
                  )}

                  {d.subscriptions.map((sub) => (
                    <div key={sub.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{sub.member_name}</p>
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            {sub.status}
                          </Badge>
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
                        {sub.payment_proof_url && (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setPreviewUrl(sub.payment_proof_url)}>
                            <Eye size={12} /> Proof
                          </Button>
                        )}
                        <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 gap-1" onClick={() => handleVerify(sub.id, "paid")}>
                          <CheckCircle2 size={12} /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300 hover:bg-red-50 gap-1" onClick={() => handleVerify(sub.id, "rejected")}>
                          <XCircle size={12} /> Reject
                        </Button>
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
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment Proof</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="rounded-xl overflow-hidden border">
              {previewUrl.toLowerCase().endsWith(".pdf") ? (
                <iframe src={previewUrl} className="w-full h-[70vh]" title="Payment Proof PDF" />
              ) : (
                <img src={previewUrl} alt="Payment Proof" className="w-full" />
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
