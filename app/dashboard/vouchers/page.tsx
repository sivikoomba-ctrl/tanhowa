"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Receipt, Plus, Upload, Eye, Trash2, IndianRupee, CheckCircle2, Clock, XCircle, ScanLine, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const expenseCategories = ["Travel", "Printing", "Food & Refreshments", "Stationery", "Communication", "Venue & Hall", "Transport", "Miscellaneous"];

interface Voucher {
  id: string;
  title: string;
  amount: number;
  description: string;
  invoice_number: string;
  vendor_name: string;
  expense_date: string | null;
  category: string;
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
  const [form, setForm] = useState({ title: "", amount: "", description: "", invoice_number: "", vendor_name: "", expense_date: "", category: "" });
  const [submitting, setSubmitting] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  useEffect(() => {
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
      .catch(() => toast.error("Failed to load vouchers"))
      .finally(() => setLoading(false));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    let receiptUrl: string | null = null;
    if (receiptFile) {
      const formData = new FormData();
      formData.append("file", receiptFile);
      const uploadRes = await fetch("/api/upload/document", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (uploadRes.ok) {
        receiptUrl = uploadData.url || uploadData.file_url;
      } else {
        toast.error("Failed to upload receipt");
        setSubmitting(false);
        return;
      }
    }

    const res = await fetch("/api/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        amount: parseFloat(form.amount) || 0,
        description: form.description,
        invoice_number: form.invoice_number,
        vendor_name: form.vendor_name,
        expense_date: form.expense_date || null,
        category: form.category,
        receipt_url: receiptUrl,
      }),
    });

    if (res.ok) {
      toast.success("Voucher submitted");
      setForm({ title: "", amount: "", description: "", invoice_number: "", vendor_name: "", expense_date: "", category: "" });
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

  async function handleScanBill(file: File) {
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai-tools/expense-ocr", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to scan bill");
        return;
      }
      const data = await res.json();
      if (data.vendor_name === "Not a receipt") {
        toast.error("This image does not appear to be a receipt or invoice.");
        return;
      }
      // Auto-fill form fields from OCR result
      const updates: typeof form = { ...form };
      if (data.vendor_name) {
        updates.vendor_name = data.vendor_name;
        if (!form.title) updates.title = `${data.vendor_name} expense`;
      }
      if (data.total_amount != null) updates.amount = String(data.total_amount);
      if (data.invoice_number) updates.invoice_number = data.invoice_number;
      if (data.category) {
        const matched = expenseCategories.find((c) => c.toLowerCase().includes(data.category.toLowerCase()));
        if (matched) updates.category = matched;
      }
      if (data.date) {
        // Parse DD/MM/YYYY to YYYY-MM-DD
        const parts = data.date.split("/");
        if (parts.length === 3) {
          updates.expense_date = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
      }
      // Build description from line items
      const descParts: string[] = [];
      if (data.items?.length) {
        descParts.push(data.items.map((item: { description: string; quantity?: number; amount?: number }) =>
          `${item.description}${item.quantity ? ` x${item.quantity}` : ""}${item.amount != null ? ` - ₹${item.amount}` : ""}`
        ).join("\n"));
      }
      if (data.tax != null) descParts.push(`Tax/GST: ₹${data.tax}`);
      if (data.payment_method) descParts.push(`Payment: ${data.payment_method}`);
      if (data.notes) descParts.push(data.notes);
      if (descParts.length) updates.description = descParts.join("\n");

      setForm(updates);
      // Also set the scanned image as receipt
      setReceiptFile(file);
      toast.success("Bill scanned! Fields auto-filled.");
    } catch {
      toast.error("Failed to scan bill");
    } finally {
      setScanning(false);
    }
  }

  if (!isOfficial && !loading) {
    return (
      <div className="text-center py-12">
        <Receipt className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">{t("voucher.officials_only")}</p>
      </div>
    );
  }

  const totalApproved = vouchers.filter((v) => v.status === "approved").reduce((sum, v) => sum + (v.amount || 0), 0);
  const pendingCount = vouchers.filter((v) => v.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("voucher.title")}</h1>
          <p className="text-sm text-muted-foreground">Submit expense claims for official duties</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-1" />
              {t("voucher.new_voucher")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("voucher.submit_voucher")}</DialogTitle>
            </DialogHeader>
            {/* Scan Bill Button */}
            <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
              <ScanLine className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Scan a bill to auto-fill</p>
                <p className="text-xs text-muted-foreground">Upload a receipt/invoice image and AI will extract the details</p>
              </div>
              <Button type="button" size="sm" variant="outline" disabled={scanning} onClick={() => scanInputRef.current?.click()}>
                {scanning ? <><Loader2 size={14} className="mr-1 animate-spin" /> Scanning...</> : <><ScanLine size={14} className="mr-1" /> Scan Bill</>}
              </Button>
              <input ref={scanInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScanBill(f); e.target.value = ""; }} />
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Expense Title *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Travel to district meeting" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Amount (&#8377;) *</Label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" required />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(val) => setForm({ ...form, category: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {expenseCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Invoice Number</Label>
                  <Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} placeholder="e.g. INV-2026-001" />
                </div>
                <div>
                  <Label>Vendor / Payee</Label>
                  <Input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} placeholder="e.g. ABC Travels" />
                </div>
              </div>
              <div>
                <Label>Date of Expense</Label>
                <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Details about the expense" rows={2} />
              </div>
              <div>
                <Label>Receipt / Invoice (optional)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={14} className="mr-1" />
                    {receiptFile ? receiptFile.name : "Upload Receipt"}
                  </Button>
                  {receiptFile && <Button type="button" variant="ghost" size="sm" onClick={() => setReceiptFile(null)}>Remove</Button>}
                </div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} />
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary/90">
                {submitting ? t("voucher.submitting") : t("voucher.submit_voucher")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("misc.total")}</p>
            <p className="text-xl font-bold">{vouchers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("voucher.pending_count")}</p>
            <p className="text-xl font-bold text-amber-600">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("voucher.approved_amount")}</p>
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
          <p className="text-muted-foreground">{t("voucher.no_vouchers")}</p>
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
                          <Badge variant="outline" className={config.color}>{config.label}</Badge>
                          {v.category && <Badge variant="outline" className="text-[10px]">{v.category}</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-sm font-medium flex items-center gap-0.5">
                            <IndianRupee size={12} />
                            {v.amount?.toLocaleString("en-IN") || 0}
                          </span>
                          {v.invoice_number && <span className="text-xs text-muted-foreground">Invoice: {v.invoice_number}</span>}
                          {v.vendor_name && <span className="text-xs text-muted-foreground">Vendor: {v.vendor_name}</span>}
                        </div>
                        {v.expense_date && <p className="text-xs text-muted-foreground mt-0.5">Expense date: {formatDate(v.expense_date)}</p>}
                        {v.description && <p className="text-xs text-muted-foreground mt-1">{v.description}</p>}
                        <span className="text-xs text-muted-foreground mt-1 block">{formatDate(v.created_at)}</span>
                        {v.receipt_url && (
                          <button onClick={() => setPreviewUrl(v.receipt_url)} className="flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                            <Eye size={12} /> {t("voucher.view_receipt")}
                          </button>
                        )}
                        {v.remarks && (
                          <div className="mt-2 p-2 bg-muted rounded-md">
                            <p className="text-xs font-medium text-muted-foreground">{t("voucher.remarks")}:</p>
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
                      <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0 shrink-0" onClick={() => handleDelete(v.id)}>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("voucher.receipt")}</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="rounded-xl overflow-hidden border">
              {previewUrl.toLowerCase().includes(".pdf") ? (
                <iframe src={previewUrl} className="w-full h-[70vh]" title="Receipt PDF" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={previewUrl} alt="Receipt" className="w-full" />
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
