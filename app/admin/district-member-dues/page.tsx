"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Calculator, ChevronDown, Eye, Users, IndianRupee, Upload } from "lucide-react";
import { PaymentProofPreviewDialog } from "@/components/payment-proof-preview-dialog";
import { fetchSignedPaymentProofUrl } from "@/lib/subscription-proofs";

interface FundRow {
  label: string;
  due: number;
  paid: number;
  extra: number;
  proofSubId: string | null;
}

interface MemberRow {
  id: string;
  name: string;
  designation: string;
  phone: string;
  totalDue: number;
  totalPaid: number;
  totalExtra: number;
  funds: FundRow[];
}

interface DistrictGroup {
  district: string;
  members: MemberRow[];
  totalMembers: number;
  totalDue: number;
  totalPaid: number;
}

export default function DistrictMemberDuesPage() {
  const [districts, setDistricts] = useState<DistrictGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDistrict, setOpenDistrict] = useState<string | null>(null);
  const [openMember, setOpenMember] = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/district-member-dues")
      .then((r) => r.json())
      .then((d) => {
        const list: DistrictGroup[] = d.districts || [];
        setDistricts(list);
        if (list.length === 1) setOpenDistrict(list[0].district);
      })
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function viewProof(subId: string) {
    setProofLoading(subId);
    try {
      const url = await fetchSignedPaymentProofUrl(subId);
      setProofPreview(url);
    } catch {
      toast.error("Failed to load proof");
    } finally {
      setProofLoading(null);
    }
  }

  const grandMembers = districts.reduce((s, d) => s + d.totalMembers, 0);
  const grandDue = districts.reduce((s, d) => s + d.totalDue, 0);
  const grandPaid = districts.reduce((s, d) => s + d.totalPaid, 0);

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
          <h1 className="text-xl font-bold">Member Dues (Verified)</h1>
          <p className="text-xs text-muted-foreground">Due, Amount Paid, Extra Paid and Proof — sourced from verified subscription records</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
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
            <p className="text-lg font-bold">₹{grandDue.toLocaleString("en-IN")}</p>
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
      </div>

      {districts.map((dist) => {
        const distOpen = openDistrict === dist.district;
        const pct = dist.totalDue > 0 ? Math.round((dist.totalPaid / dist.totalDue) * 100) : 0;
        return (
          <Card key={dist.district}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
              onClick={() => setOpenDistrict(distOpen ? null : dist.district)}
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
                  <Badge variant="outline" className="text-muted-foreground">{pct}%</Badge>
                </div>
                <ChevronDown size={16} className={`text-muted-foreground transition-transform ${distOpen ? "rotate-180" : ""}`} />
              </div>
            </button>

            {distOpen && (
              <CardContent className="pt-0 pb-3 px-3 space-y-2">
                {dist.members.map((m) => {
                  const memberOpen = openMember === m.id;
                  return (
                    <div key={m.id} className="border rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors text-left"
                        onClick={() => setOpenMember(memberOpen ? null : m.id)}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{m.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{m.designation}{m.phone ? ` • ${m.phone}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-[10px]">
                          <Badge variant="outline">Due: ₹{m.totalDue.toLocaleString("en-IN")}</Badge>
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Paid: ₹{m.totalPaid.toLocaleString("en-IN")}</Badge>
                          {m.totalExtra > 0 && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">+₹{m.totalExtra.toLocaleString("en-IN")}</Badge>
                          )}
                          <ChevronDown size={14} className={`text-muted-foreground transition-transform ${memberOpen ? "rotate-180" : ""}`} />
                        </div>
                      </button>

                      {memberOpen && (
                        <div className="overflow-x-auto border-t">
                          <table className="w-full text-[11px] border-collapse min-w-[600px]">
                            <thead>
                              <tr className="bg-primary/5">
                                <th className="border px-2 py-1.5 text-left font-semibold">Description</th>
                                <th className="border px-2 py-1.5 text-right font-semibold w-24">Due Amount (₹)</th>
                                <th className="border px-2 py-1.5 text-right font-semibold w-24">Amount Paid (₹)</th>
                                <th className="border px-2 py-1.5 text-right font-semibold w-24">Extra Paid (₹)</th>
                                <th className="border px-2 py-1.5 text-center font-semibold w-20">Proof</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.funds.map((f) => (
                                <tr key={f.label}>
                                  <td className="border px-2 py-1.5">{f.label}</td>
                                  <td className="border px-2 py-1.5 text-right font-mono">{f.due.toLocaleString("en-IN")}</td>
                                  <td className="border px-2 py-1.5 text-right font-mono text-green-700">
                                    {f.paid > 0 ? f.paid.toLocaleString("en-IN") : <span className="text-muted-foreground">—</span>}
                                  </td>
                                  <td className="border px-2 py-1.5 text-right font-mono text-blue-700">
                                    {f.extra > 0 ? f.extra.toLocaleString("en-IN") : <span className="text-muted-foreground">—</span>}
                                  </td>
                                  <td className="border px-2 py-1.5 text-center">
                                    {f.proofSubId ? (
                                      <button
                                        onClick={() => viewProof(f.proofSubId!)}
                                        disabled={proofLoading === f.proofSubId}
                                        className="text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded hover:bg-green-100 inline-flex items-center gap-1 disabled:opacity-50"
                                      >
                                        <Eye size={10} /> View
                                      </button>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              <tr className="bg-primary/5 font-semibold">
                                <td className="border px-2 py-1.5">Total</td>
                                <td className="border px-2 py-1.5 text-right font-mono">{m.totalDue.toLocaleString("en-IN")}</td>
                                <td className="border px-2 py-1.5 text-right font-mono text-green-700">{m.totalPaid.toLocaleString("en-IN")}</td>
                                <td className="border px-2 py-1.5 text-right font-mono text-blue-700">{m.totalExtra.toLocaleString("en-IN")}</td>
                                <td className="border px-2 py-1.5"></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}

      {districts.length === 0 && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <Upload size={32} className="mx-auto mb-2 opacity-30" />
          <p>No member data available</p>
        </div>
      )}

      <PaymentProofPreviewDialog
        open={!!proofPreview}
        onOpenChange={(open) => { if (!open) setProofPreview(null); }}
        url={proofPreview}
      />
    </div>
  );
}
