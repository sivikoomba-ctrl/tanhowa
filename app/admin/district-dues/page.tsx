"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Calculator, ChevronDown, Save, Loader2, Eye, Users, IndianRupee, AlertTriangle } from "lucide-react";
import { PaymentProofPreviewDialog } from "@/components/payment-proof-preview-dialog";

interface MemberRow {
  id: string;
  name: string;
  designation: string;
  phone: string;
  district: string;
  dues2025: number;
  dues2026: number;
  duesUatt: number;
  totalToPay: number;
  amountPaid: number;
  pendingAmount: number;
  additionalMoney: number;
  proofUrl: string | null;
}

interface DistrictGroup {
  district: string;
  members: MemberRow[];
  totalMembers: number;
  totalToPay: number;
  totalPaid: number;
  totalPending: number;
  totalAdditional: number;
}

export default function DistrictDuesPage() {
  const [districts, setDistricts] = useState<DistrictGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { amountPaid?: string; additionalMoney?: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/district-dues")
      .then((r) => r.json())
      .then((d) => setDistricts(d.districts || []))
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function getEdit(memberId: string, field: "amountPaid" | "additionalMoney", original: number): string {
    return edits[memberId]?.[field] ?? String(original || 0);
  }

  function setEdit(memberId: string, field: "amountPaid" | "additionalMoney", value: string) {
    setEdits((prev) => ({
      ...prev,
      [memberId]: { ...prev[memberId], [field]: value },
    }));
  }

  async function saveMember(memberId: string) {
    const edit = edits[memberId];
    if (!edit) return;
    setSaving(memberId);
    try {
      const res = await fetch("/api/district-dues", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: memberId,
          ...(edit.amountPaid != null ? { amount_paid: Number(edit.amountPaid) || 0 } : {}),
          ...(edit.additionalMoney != null ? { additional_money: Number(edit.additionalMoney) || 0 } : {}),
        }),
      });
      if (res.ok) {
        toast.success("Saved!");
        // Clear edit and refresh
        setEdits((prev) => { const n = { ...prev }; delete n[memberId]; return n; });
        load();
      } else {
        const d = await res.json();
        toast.error(d.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(null);
    }
  }

  // Grand totals
  const grandToPay = districts.reduce((s, d) => s + d.totalToPay, 0);
  const grandPaid = districts.reduce((s, d) => s + d.totalPaid, 0);
  const grandPending = districts.reduce((s, d) => s + d.totalPending, 0);
  const grandMembers = districts.reduce((s, d) => s + d.totalMembers, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Calculator size={22} className="text-primary" />
        <div>
          <h1 className="text-xl font-bold">District Dues Report</h1>
          <p className="text-xs text-muted-foreground">TAMIL NADU HORTICULTURAL OFFICERS WELFARE ASSOCIATION</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Users size={16} className="mx-auto text-blue-500 mb-1" />
            <p className="text-lg font-bold">{grandMembers}</p>
            <p className="text-[10px] text-muted-foreground">Total Members</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <IndianRupee size={16} className="mx-auto text-primary mb-1" />
            <p className="text-lg font-bold">₹{grandToPay.toLocaleString("en-IN")}</p>
            <p className="text-[10px] text-muted-foreground">Total Due</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <IndianRupee size={16} className="mx-auto text-green-600 mb-1" />
            <p className="text-lg font-bold text-green-600">₹{grandPaid.toLocaleString("en-IN")}</p>
            <p className="text-[10px] text-muted-foreground">Total Paid</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <AlertTriangle size={16} className="mx-auto text-red-500 mb-1" />
            <p className="text-lg font-bold text-red-600">₹{grandPending.toLocaleString("en-IN")}</p>
            <p className="text-[10px] text-muted-foreground">Total Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* District Groups */}
      {districts.map((dist) => {
        const isOpen = expanded === dist.district;
        const pct = dist.totalToPay > 0 ? Math.round((dist.totalPaid / dist.totalToPay) * 100) : 0;
        return (
          <Card key={dist.district}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
              onClick={() => setExpanded(isOpen ? null : dist.district)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Users size={14} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm truncate">{dist.district}</h3>
                  <p className="text-[10px] text-muted-foreground">{dist.totalMembers} members</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden sm:flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Paid: ₹{dist.totalPaid.toLocaleString("en-IN")}
                  </Badge>
                  <Badge variant="outline" className={dist.totalPending > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"}>
                    Pending: ₹{dist.totalPending.toLocaleString("en-IN")}
                  </Badge>
                  <Badge variant="outline" className="text-muted-foreground">
                    {pct}%
                  </Badge>
                </div>
                <ChevronDown size={16} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </button>

            {isOpen && (
              <CardContent className="pt-0 pb-3 px-3">
                {/* Mobile summary */}
                <div className="sm:hidden flex gap-2 mb-2 text-[10px]">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Paid: ₹{dist.totalPaid.toLocaleString("en-IN")}</Badge>
                  <Badge variant="outline" className={dist.totalPending > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700"}>Pending: ₹{dist.totalPending.toLocaleString("en-IN")}</Badge>
                  <Badge variant="outline">{pct}%</Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-primary/5">
                        <th className="border px-2 py-1.5 text-left w-8">#</th>
                        <th className="border px-2 py-1.5 text-left">Name</th>
                        <th className="border px-2 py-1.5 text-left w-20">Designation</th>
                        <th className="border px-2 py-1.5 text-right w-20">Due ≤2025</th>
                        <th className="border px-2 py-1.5 text-right w-16">2026</th>
                        <th className="border px-2 py-1.5 text-right w-16">UATT</th>
                        <th className="border px-2 py-1.5 text-right w-20 font-bold">Total</th>
                        <th className="border px-2 py-1.5 text-right w-24 bg-green-50">Paid (₹)</th>
                        <th className="border px-2 py-1.5 text-right w-20">Pending</th>
                        <th className="border px-2 py-1.5 text-center w-16">Phone</th>
                        <th className="border px-2 py-1.5 text-right w-20 bg-amber-50">Addl (₹)</th>
                        <th className="border px-2 py-1.5 text-center w-16">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dist.members.map((m, i) => {
                        const paid = Number(getEdit(m.id, "amountPaid", m.amountPaid)) || 0;
                        const pending = m.totalToPay - paid;
                        const hasEdit = !!edits[m.id];
                        return (
                          <tr key={m.id} className={hasEdit ? "bg-yellow-50/50" : ""}>
                            <td className="border px-2 py-1">{i + 1}</td>
                            <td className="border px-2 py-1 font-medium">
                              <div className="flex items-center gap-1">
                                {m.name}
                                {m.proofUrl && (
                                  <button onClick={() => setProofPreview(m.proofUrl)} className="text-green-600 hover:text-green-800">
                                    <Eye size={12} />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="border px-2 py-1 text-muted-foreground">{m.designation}</td>
                            <td className="border px-2 py-1 text-right font-mono">{m.dues2025.toLocaleString("en-IN")}</td>
                            <td className="border px-2 py-1 text-right font-mono">{m.dues2026.toLocaleString("en-IN")}</td>
                            <td className="border px-2 py-1 text-right font-mono">{m.duesUatt.toLocaleString("en-IN")}</td>
                            <td className="border px-2 py-1 text-right font-mono font-bold">{m.totalToPay.toLocaleString("en-IN")}</td>
                            <td className="border px-0.5 py-0.5 bg-green-50">
                              <Input
                                type="number"
                                min="0"
                                value={getEdit(m.id, "amountPaid", m.amountPaid)}
                                onChange={(e) => setEdit(m.id, "amountPaid", e.target.value)}
                                className="h-6 text-[11px] text-right font-mono border-green-300 focus:border-green-500 px-1"
                              />
                            </td>
                            <td className={`border px-2 py-1 text-right font-mono font-semibold ${pending > 0 ? "text-red-600" : "text-green-600"}`}>
                              {pending > 0 ? pending.toLocaleString("en-IN") : "0"}
                            </td>
                            <td className={`border px-2 py-1 text-center ${/^[6-9]\d{9}$/.test(m.phone) ? "text-muted-foreground" : "text-red-600 bg-red-50 font-medium"}`} title={/^[6-9]\d{9}$/.test(m.phone) ? "" : "Invalid format — should be 10 digits"}>
                              {m.phone}{!/^[6-9]\d{9}$/.test(m.phone) && m.phone && <span className="text-[9px]"> ⚠</span>}
                            </td>
                            <td className="border px-0.5 py-0.5 bg-amber-50">
                              <Input
                                type="number"
                                min="0"
                                value={getEdit(m.id, "additionalMoney", m.additionalMoney)}
                                onChange={(e) => setEdit(m.id, "additionalMoney", e.target.value)}
                                className="h-6 text-[11px] text-right font-mono border-amber-300 focus:border-amber-500 px-1"
                              />
                            </td>
                            <td className="border px-1 py-1 text-center">
                              {hasEdit && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  disabled={saving === m.id}
                                  onClick={() => saveMember(m.id)}
                                >
                                  {saving === m.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} className="text-primary" />}
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {/* District totals row */}
                      <tr className="bg-primary/5 font-bold">
                        <td className="border px-2 py-1.5" colSpan={3}>District Total</td>
                        <td className="border px-2 py-1.5 text-right font-mono">{dist.members.reduce((s, m) => s + m.dues2025, 0).toLocaleString("en-IN")}</td>
                        <td className="border px-2 py-1.5 text-right font-mono">{dist.members.reduce((s, m) => s + m.dues2026, 0).toLocaleString("en-IN")}</td>
                        <td className="border px-2 py-1.5 text-right font-mono">{dist.members.reduce((s, m) => s + m.duesUatt, 0).toLocaleString("en-IN")}</td>
                        <td className="border px-2 py-1.5 text-right font-mono">{dist.totalToPay.toLocaleString("en-IN")}</td>
                        <td className="border px-2 py-1.5 text-right font-mono text-green-600">{dist.totalPaid.toLocaleString("en-IN")}</td>
                        <td className="border px-2 py-1.5 text-right font-mono text-red-600">{dist.totalPending.toLocaleString("en-IN")}</td>
                        <td className="border px-2 py-1.5"></td>
                        <td className="border px-2 py-1.5 text-right font-mono text-amber-600">{dist.totalAdditional.toLocaleString("en-IN")}</td>
                        <td className="border px-2 py-1.5"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {districts.length === 0 && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <Calculator size={32} className="mx-auto mb-2 opacity-30" />
          <p>No district data available</p>
        </div>
      )}

      {/* Proof Preview */}
      <PaymentProofPreviewDialog
        open={!!proofPreview}
        onOpenChange={(open) => { if (!open) setProofPreview(null); }}
        url={proofPreview}
      />
    </div>
  );
}
