"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Receipt, Trash2, IndianRupee, CheckCircle2, Clock, XCircle, Eye } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Voucher {
  id: string;
  title: string;
  amount: number;
  description: string;
  receipt_url: string | null;
  status: string;
  remarks: string;
  created_at: string;
  submitted_by: string;
  submitter?: { id: string; name: string; email: string; phone: string; official_type: string | null } | null;
  approver?: { name: string } | null;
  approved_at: string | null;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-300" },
  approved: { label: "Approved", color: "bg-green-100 text-green-700 border-green-300" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 border-red-300" },
};

export default function AdminVouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [tab, setTab] = useState("pending");
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/vouchers?status=" + tab)
      .then((r) => r.json())
      .then((d) => setVouchers(d.vouchers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [tab]);

  async function handleAction(id: string, status: string) {
    const res = await fetch("/api/vouchers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, remarks: remarks[id] || "" }),
    });
    if (res.ok) {
      toast.success(`Voucher ${status}`);
      load();
    } else {
      toast.error("Failed to update");
    }
  }

  async function handleSaveRemarks(id: string) {
    const res = await fetch("/api/vouchers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, remarks: remarks[id] || "" }),
    });
    if (res.ok) {
      toast.success("Remarks saved");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this voucher?")) return;
    const res = await fetch(`/api/vouchers?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      load();
    }
  }

  const totalPending = vouchers.filter((v) => v.status === "pending").reduce((sum, v) => sum + (v.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Receipt className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Expense Vouchers</h1>
          <p className="text-sm text-muted-foreground">Review and approve expense claims from officials</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : vouchers.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No {tab === "all" ? "" : tab} vouchers</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tab === "pending" && totalPending > 0 && (
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Pending approval total: <span className="font-bold text-foreground">&#8377;{totalPending.toLocaleString("en-IN")}</span></p>
                  </CardContent>
                </Card>
              )}
              {vouchers.map((v) => {
                const config = statusConfig[v.status] || statusConfig.pending;
                return (
                  <Card key={v.id}>
                    <CardContent className="pt-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Receipt className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-medium text-sm">{v.title}</h3>
                                <Badge variant="outline" className={config.color}>{config.label}</Badge>
                                {v.submitter?.official_type && (
                                  <Badge variant="outline" className={v.submitter.official_type === "state" ? "bg-purple-50 text-purple-700 border-purple-300 text-[10px]" : "bg-blue-50 text-blue-700 border-blue-300 text-[10px]"}>
                                    {v.submitter.official_type === "state" ? "State" : "District"} Official
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-sm font-semibold flex items-center gap-0.5">
                                  <IndianRupee size={12} />
                                  {v.amount?.toLocaleString("en-IN") || 0}
                                </span>
                              </div>
                              {v.description && <p className="text-xs text-muted-foreground mt-1">{v.description}</p>}
                              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                {v.submitter?.name && <span className="text-xs text-muted-foreground uppercase">by {v.submitter.name}</span>}
                                <span className="text-xs text-muted-foreground">{formatDate(v.created_at)}</span>
                              </div>
                              {v.receipt_url && (
                                <button
                                  onClick={() => setPreviewUrl(v.receipt_url)}
                                  className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                                >
                                  <Eye size={12} /> View receipt
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {v.status === "pending" && (
                              <>
                                <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => handleAction(v.id, "approved")}>
                                  <CheckCircle2 size={12} className="mr-1" /> Approve
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300 hover:bg-red-50" onClick={() => handleAction(v.id, "rejected")}>
                                  <XCircle size={12} className="mr-1" /> Reject
                                </Button>
                              </>
                            )}
                            <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0" onClick={() => handleDelete(v.id)}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>

                        {/* Admin remarks */}
                        <div className="ml-0 sm:ml-13">
                          <Textarea
                            placeholder="Add admin remarks..."
                            value={remarks[v.id] ?? v.remarks ?? ""}
                            onChange={(e) => setRemarks({ ...remarks, [v.id]: e.target.value })}
                            rows={2}
                            className="text-xs"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-1.5"
                            onClick={() => handleSaveRemarks(v.id)}
                          >
                            Save Remarks
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Receipt Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Receipt</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="rounded-xl overflow-hidden border">
              <img src={previewUrl} alt="Receipt" className="w-full" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
