"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Receipt, Plus, Upload, Eye, Trash2, IndianRupee, CheckCircle2, Clock, XCircle } from "lucide-react";
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
  approver?: { name: string } | null;
  approved_at: string | null;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-300", icon: Clock },
  approved: { label: "Approved", color: "bg-green-100 text-green-700 border-green-300", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 border-red-300", icon: XCircle },
};

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [isOfficial, setIsOfficial] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", amount: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is an official
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.official_type === "state" || d.user?.official_type === "district") {
          setIsOfficial(true);
        }
      })
      .catch(() => {});
    load();
  }, []);

  function load() {
    setLoading(true);
    fetch("/api/vouchers")
      .then((r) => r.json())
      .then((d) => setVouchers(d.vouchers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    // Upload receipt first if provided
    let receiptUrl: string | null = null;
    if (receiptFile) {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", receiptFile);
      const uploadRes = await fetch("/api/upload/document", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (uploadRes.ok) {
        receiptUrl = uploadData.url || uploadData.file_url;
      } else {
        toast.error("Failed to upload receipt");
        setSubmitting(false);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const res = await fetch("/api/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        amount: parseFloat(form.amount) || 0,
        description: form.description,
        receipt_url: receiptUrl,
      }),
    });

    if (res.ok) {
      toast.success("Voucher submitted");
      setForm({ title: "", amount: "", description: "" });
      setReceiptFile(null);
      setDialogOpen(false);
      load();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to submit");
    }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this voucher?")) return;
    const res = await fetch(`/api/vouchers?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      load();
    } else {
      toast.error("Failed to delete");
    }
  }

  if (!isOfficial && !loading) {
    return (
      <div className="text-center py-12">
        <Receipt className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">Expense vouchers are available to officials only</p>
      </div>
    );
  }

  const totalApproved = vouchers.filter((v) => v.status === "approved").reduce((sum, v) => sum + (v.amount || 0), 0);
  const pendingCount = vouchers.filter((v) => v.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expense Vouchers</h1>
          <p className="text-sm text-muted-foreground">Submit expense claims for official duties</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-1" />
              New Voucher
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Expense Voucher</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Expense Title *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Travel to district meeting"
                  required
                />
              </div>
              <div>
                <Label>Amount (&#8377;) *</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0"
                  required
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Details about the expense"
                  rows={3}
                />
              </div>
              <div>
                <Label>Receipt / Proof (optional)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={14} className="mr-1" />
                    {receiptFile ? receiptFile.name : "Upload Receipt"}
                  </Button>
                  {receiptFile && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setReceiptFile(null)}>
                      Remove
                    </Button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                />
              </div>
              <Button type="submit" disabled={submitting || uploading} className="w-full bg-primary hover:bg-primary/90">
                {uploading ? "Uploading receipt..." : submitting ? "Submitting..." : "Submit Voucher"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Submitted</p>
            <p className="text-xl font-bold">{vouchers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-xl font-bold text-amber-600">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Approved</p>
            <p className="text-xl font-bold text-green-600">&#8377;{totalApproved.toLocaleString("en-IN")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Vouchers List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : vouchers.length === 0 ? (
        <div className="text-center py-12">
          <Receipt className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No vouchers submitted yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {vouchers.map((v) => {
            const config = statusConfig[v.status] || statusConfig.pending;
            const Icon = config.icon;
            return (
              <Card key={v.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className={`w-5 h-5 ${v.status === "approved" ? "text-green-600" : v.status === "rejected" ? "text-red-600" : "text-amber-600"}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{v.title}</h3>
                          <Badge variant="outline" className={config.color}>
                            {config.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-sm font-medium flex items-center gap-0.5">
                            <IndianRupee size={12} />
                            {v.amount?.toLocaleString("en-IN") || 0}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatDate(v.created_at)}</span>
                        </div>
                        {v.description && (
                          <p className="text-xs text-muted-foreground mt-1">{v.description}</p>
                        )}
                        {v.receipt_url && (
                          <button
                            onClick={() => setPreviewUrl(v.receipt_url)}
                            className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                          >
                            <Eye size={12} /> View receipt
                          </button>
                        )}
                        {v.remarks && (
                          <div className="mt-2 p-2 bg-muted rounded-md">
                            <p className="text-xs font-medium text-muted-foreground">Admin Remarks:</p>
                            <p className="text-xs mt-0.5">{v.remarks}</p>
                          </div>
                        )}
                        {v.approved_at && v.approver && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {v.status === "approved" ? "Approved" : "Reviewed"} by {v.approver.name} on {formatDate(v.approved_at)}
                          </p>
                        )}
                      </div>
                    </div>
                    {v.status === "pending" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive h-8 w-8 p-0 shrink-0"
                        onClick={() => handleDelete(v.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
