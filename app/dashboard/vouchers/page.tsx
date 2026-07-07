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
import { Receipt, Plus, Upload, Eye, Trash2, IndianRupee, CheckCircle2, Clock, XCircle, ScanLine, Loader2, Pencil } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const expenseCategories = ["Travel", "Printing", "Food & Refreshments", "Stationery", "Communication", "Venue & Hall", "Transport", "Miscellaneous"];

type VoucherFormFields = {
  title: string;
  amount: string;
  description: string;
  invoice_number: string;
  vendor_name: string;
  expense_date: string;
  expense_event: string;
  category: string;
  payment_method: string;
  payment_transaction_id: string;
  payment_date: string;
  paid_to: string;
};

interface BillScanData {
  vendor_name?: string;
  total_amount?: number;
  invoice_number?: string;
  category?: string;
  date?: string;
  items?: { description: string; quantity?: number; amount?: number }[];
  tax?: number;
  payment_method?: string;
  notes?: string;
}

interface PaymentScanData {
  payment_method?: string | null;
  transaction_id?: string | null;
  date?: string | null;
  paid_to?: string | null;
  amount?: number | null;
}

// Shared by both the create-voucher and edit-voucher scan flows so a fix to
// the OCR field-mapping only has to be made once. Pure functions — callers
// apply the returned patch via a functional setState update so concurrent
// scans (bill + payment, or a manual edit mid-scan) merge instead of clobber.
function buildBillScanUpdates(data: BillScanData, current: VoucherFormFields, opts: { fillTitle: boolean }): Partial<VoucherFormFields> {
  const patch: Partial<VoucherFormFields> = {};
  if (data.vendor_name) {
    patch.vendor_name = data.vendor_name;
    if (opts.fillTitle && !current.title) patch.title = `${data.vendor_name} expense`;
  }
  if (data.total_amount != null) {
    patch.amount = String(Math.round(Number(data.total_amount)));
  }
  if (data.invoice_number) patch.invoice_number = data.invoice_number;
  if (data.category) {
    const matched = expenseCategories.find((c) => c.toLowerCase().includes(data.category!.toLowerCase()));
    if (matched) patch.category = matched;
  }
  if (data.date) {
    // Parse DD/MM/YYYY to YYYY-MM-DD
    const parts = data.date.split("/");
    if (parts.length === 3) {
      patch.expense_date = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }
  // Build description from line items — appended (not replaced) when the
  // current description is non-empty, so re-scanning an existing voucher
  // never silently discards a hand-written note.
  const descParts: string[] = [];
  if (data.items?.length) {
    descParts.push(data.items.map((item) =>
      `${item.description}${item.quantity ? ` x${item.quantity}` : ""}${item.amount != null ? ` - ₹${item.amount}` : ""}`
    ).join("\n"));
  }
  if (data.tax != null) descParts.push(`Tax/GST: ₹${data.tax}`);
  if (data.payment_method) descParts.push(`Payment: ${data.payment_method}`);
  if (data.notes) descParts.push(data.notes);
  if (descParts.length) {
    const scanned = descParts.join("\n");
    patch.description = current.description ? `${current.description}\n\n--- Scanned bill details ---\n${scanned}` : scanned;
  }
  return patch;
}

function buildPaymentScanUpdates(data: PaymentScanData, current: VoucherFormFields, canFillAmount: boolean): Partial<VoucherFormFields> {
  const patch: Partial<VoucherFormFields> = {};
  if (data.payment_method) patch.payment_method = data.payment_method;
  if (data.transaction_id) patch.payment_transaction_id = data.transaction_id;
  if (data.date) patch.payment_date = data.date;
  if (data.paid_to) patch.paid_to = data.paid_to;
  // If a bill amount has not already been scanned, take the payment amount
  // as a reasonable default when the amount field is still empty. Never
  // overwrite a bill-scanned (or otherwise already-known) amount.
  if (data.amount != null && canFillAmount && !current.amount) {
    patch.amount = String(Math.round(Number(data.amount)));
  }
  return patch;
}

interface Voucher {
  id: string;
  title: string;
  amount: number;
  description: string;
  invoice_number: string;
  expense_event: string;
  vendor_name: string;
  expense_date: string | null;
  category: string;
  receipt_url: string | null;
  payment_proof_url: string | null;
  payment_method: string;
  payment_transaction_id: string;
  payment_date: string | null;
  paid_to: string;
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
  const [form, setForm] = useState<VoucherFormFields>({
    title: "", amount: "", description: "", invoice_number: "", vendor_name: "", expense_date: "", expense_event: "", category: "",
    payment_method: "", payment_transaction_id: "", payment_date: "", paid_to: "",
  });
  // scannedBillAmount is the bill amount as captured by Scan Bill. We compare
  // it to the payment amount extracted from Scan Payment Proof to surface a
  // non-blocking mismatch warning. Stored separately because the user may edit
  // form.amount manually afterwards — we still want to compare against the
  // original scanned values. The *Ref twins mirror this state synchronously
  // (state updates only land on the next render) so a concurrent scan can
  // read the latest "was a bill already scanned" fact without racing.
  const [scannedBillAmount, setScannedBillAmount] = useState<number | null>(null);
  const [scannedPaymentAmount, setScannedPaymentAmount] = useState<number | null>(null);
  const scannedBillAmountRef = useRef<number | null>(null);
  const scannedPaymentAmountRef = useRef<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const paymentFileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editVoucher, setEditVoucher] = useState<Voucher | null>(null);
  const [editForm, setEditForm] = useState<VoucherFormFields>({
    title: "", amount: "", description: "", invoice_number: "", vendor_name: "", expense_date: "", expense_event: "", category: "",
    payment_method: "", payment_transaction_id: "", payment_date: "", paid_to: "",
  });
  const [editScannedBillAmount, setEditScannedBillAmount] = useState<number | null>(null);
  const [editScannedPaymentAmount, setEditScannedPaymentAmount] = useState<number | null>(null);
  const editScannedBillAmountRef = useRef<number | null>(null);
  const editScannedPaymentAmountRef = useRef<number | null>(null);
  // Tracks which voucher the Edit dialog is currently open for. Scan handlers
  // snapshot this at start and re-check it when their async OCR call resolves
  // — if the user has since closed the dialog or switched to editing a
  // different voucher, the ref will have changed and the stale scan result is
  // discarded instead of being written into the wrong voucher's form.
  const editVoucherIdRef = useRef<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanningPayment, setScanningPayment] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scanPaymentInputRef = useRef<HTMLInputElement>(null);
  const [editScanning, setEditScanning] = useState(false);
  const [editScanningPayment, setEditScanningPayment] = useState(false);
  const editScanInputRef = useRef<HTMLInputElement>(null);
  const editScanPaymentInputRef = useRef<HTMLInputElement>(null);
  // Only used to attach a receipt/payment-proof for the FIRST time on a
  // voucher that currently has none — the server refuses to replace an
  // already-attached proof (receipt-substitution guard), and the UI only
  // shows the upload controls when editVoucher.receipt_url/payment_proof_url
  // is empty, so this can never be used to swap out an existing file.
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null);
  const [editPaymentProofFile, setEditPaymentProofFile] = useState<File | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const editPaymentFileInputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        // Match the nav gating (layout.tsx) and the API's isAdminOrOfficial():
        // officials AND admins/super_admins can submit. Otherwise admins see the
        // Vouchers nav link but hit the "officials only" dead-end screen.
        if (
          d.user?.official_type === "state" ||
          d.user?.official_type === "district" ||
          d.user?.role === "admin" ||
          d.user?.role === "super_admin"
        ) {
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

  async function uploadFile(file: File): Promise<string | null> {
    const formData = new FormData();
    formData.append("file", file);
    const uploadRes = await fetch("/api/upload/document", { method: "POST", body: formData });
    const uploadData = await uploadRes.json();
    if (uploadRes.ok) return uploadData.url || uploadData.file_url;
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    let receiptUrl: string | null = null;
    if (receiptFile) {
      receiptUrl = await uploadFile(receiptFile);
      if (!receiptUrl) {
        toast.error("Failed to upload receipt");
        setSubmitting(false);
        return;
      }
    }

    let paymentProofUrl: string | null = null;
    if (paymentProofFile) {
      paymentProofUrl = await uploadFile(paymentProofFile);
      if (!paymentProofUrl) {
        toast.error("Failed to upload payment proof");
        setSubmitting(false);
        return;
      }
    }

    const res = await fetch("/api/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        amount: Math.round(parseFloat(form.amount) || 0),
        description: form.description,
        invoice_number: form.invoice_number,
        vendor_name: form.vendor_name,
        expense_date: form.expense_date || null,
        expense_event: form.expense_event,
        category: form.category,
        receipt_url: receiptUrl,
        payment_proof_url: paymentProofUrl,
        payment_method: form.payment_method,
        payment_transaction_id: form.payment_transaction_id,
        payment_date: form.payment_date || null,
        paid_to: form.paid_to,
      }),
    });

    if (res.ok) {
      toast.success("Voucher submitted");
      setForm({
        title: "", amount: "", description: "", invoice_number: "", vendor_name: "", expense_date: "", expense_event: "", category: "",
        payment_method: "", payment_transaction_id: "", payment_date: "", paid_to: "",
      });
      setReceiptFile(null);
      setPaymentProofFile(null);
      setScannedBillAmount(null);
      setScannedPaymentAmount(null);
      scannedBillAmountRef.current = null;
      scannedPaymentAmountRef.current = null;
      setDialogOpen(false);
      load();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to submit");
    }
    setSubmitting(false);
  }

  function openEdit(v: Voucher) {
    setEditForm({
      title: v.title || "",
      amount: v.amount != null ? String(v.amount) : "",
      description: v.description || "",
      invoice_number: v.invoice_number || "",
      vendor_name: v.vendor_name || "",
      expense_date: (v.expense_date || "").slice(0, 10),
      expense_event: v.expense_event || "",
      category: v.category || "",
      payment_method: v.payment_method || "",
      payment_transaction_id: v.payment_transaction_id || "",
      payment_date: (v.payment_date || "").slice(0, 10),
      paid_to: v.paid_to || "",
    });
    editVoucherIdRef.current = v.id;
    editScannedBillAmountRef.current = null;
    editScannedPaymentAmountRef.current = null;
    setEditScannedBillAmount(null);
    setEditScannedPaymentAmount(null);
    setEditReceiptFile(null);
    setEditPaymentProofFile(null);
    setEditVoucher(v);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editVoucher) return;
    setSavingEdit(true);

    // Only ever sent when the voucher currently has none — see the
    // editReceiptFile/editPaymentProofFile declaration for why this can't
    // be used to replace an existing proof.
    let receiptUrl: string | null = null;
    if (editReceiptFile) {
      receiptUrl = await uploadFile(editReceiptFile);
      if (!receiptUrl) {
        toast.error("Failed to upload receipt");
        setSavingEdit(false);
        return;
      }
    }
    let paymentProofUrl: string | null = null;
    if (editPaymentProofFile) {
      paymentProofUrl = await uploadFile(editPaymentProofFile);
      if (!paymentProofUrl) {
        toast.error("Failed to upload payment proof");
        setSavingEdit(false);
        return;
      }
    }

    const res = await fetch("/api/vouchers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editVoucher.id,
        title: editForm.title,
        amount: Math.round(parseFloat(editForm.amount) || 0),
        description: editForm.description,
        invoice_number: editForm.invoice_number,
        vendor_name: editForm.vendor_name,
        expense_date: editForm.expense_date || null,
        expense_event: editForm.expense_event,
        category: editForm.category,
        payment_method: editForm.payment_method,
        payment_transaction_id: editForm.payment_transaction_id,
        payment_date: editForm.payment_date || null,
        paid_to: editForm.paid_to,
        ...(receiptUrl ? { receipt_url: receiptUrl } : {}),
        ...(paymentProofUrl ? { payment_proof_url: paymentProofUrl } : {}),
      }),
    });
    if (res.ok) {
      toast.success("Voucher updated");
      setEditVoucher(null);
      load();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error || "Failed to update");
      if (res.status === 409) {
        // Voucher status changed under us (e.g. Finance acted on it while
        // this dialog was open) — the edit couldn't apply. Close and refresh
        // so the user sees its current state instead of re-editing a stale copy.
        editVoucherIdRef.current = null;
        setEditVoucher(null);
        load();
      }
    }
    setSavingEdit(false);
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
        toast.error(data.error || t("voucher.scan_bill_failed"));
        return;
      }
      const data = await res.json();
      if (data.vendor_name === "Not a receipt") {
        toast.error(t("voucher.scan_not_receipt"));
        return;
      }
      if (data.total_amount != null) {
        scannedBillAmountRef.current = Number(data.total_amount);
        setScannedBillAmount(scannedBillAmountRef.current);
      }
      // Functional update: builds the patch from the LATEST form state at
      // apply time, so a concurrent Scan Payment (or a manual keystroke)
      // that lands first is merged with, not clobbered by, this scan.
      setForm((prev) => ({ ...prev, ...buildBillScanUpdates(data, prev, { fillTitle: true }) }));
      // Also set the scanned image as receipt
      setReceiptFile(file);
      toast.success(t("voucher.scan_bill_success"));
    } catch {
      toast.error(t("voucher.scan_bill_failed"));
    } finally {
      setScanning(false);
    }
  }

  async function handleScanPayment(file: File) {
    setScanningPayment(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/payment-proof/extract-date", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || t("voucher.scan_payment_failed"));
        return;
      }
      const data = await res.json();
      // The endpoint returns nulls for unrecognised images rather than an
      // explicit error code, so detect "nothing extracted" and bail.
      if (data.date == null && data.transaction_id == null && data.amount == null && data.paid_to == null) {
        toast.error(t("voucher.scan_payment_unreadable"));
        return;
      }
      if (data.amount != null) {
        scannedPaymentAmountRef.current = Number(data.amount);
        setScannedPaymentAmount(scannedPaymentAmountRef.current);
      }
      // Read via the ref (not the scannedBillAmount state) so a bill scan
      // that resolved moments ago — before this render committed — is still
      // seen, avoiding a race where both scans think no bill amount exists.
      const canFillAmount = scannedBillAmountRef.current == null;
      setForm((prev) => ({ ...prev, ...buildPaymentScanUpdates(data, prev, canFillAmount) }));
      setPaymentProofFile(file);
      toast.success(t("voucher.scan_payment_success"));
    } catch {
      toast.error(t("voucher.scan_payment_failed"));
    } finally {
      setScanningPayment(false);
    }
  }

  async function handleEditScanBill(file: File) {
    const voucherIdAtStart = editVoucherIdRef.current;
    setEditScanning(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai-tools/expense-ocr", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || t("voucher.scan_bill_failed"));
        return;
      }
      const data = await res.json();
      if (data.vendor_name === "Not a receipt") {
        toast.error(t("voucher.scan_not_receipt"));
        return;
      }
      // If the Edit dialog was closed or switched to a different voucher
      // while this scan was in flight, discard the result instead of
      // silently writing it into whatever voucher is now open.
      if (!editVoucherIdRef.current || editVoucherIdRef.current !== voucherIdAtStart) {
        toast.error(t("voucher.scan_stale_voucher"));
        return;
      }
      // Auto-fill edit form fields from OCR result.
      if (data.total_amount != null) {
        editScannedBillAmountRef.current = Number(data.total_amount);
        setEditScannedBillAmount(editScannedBillAmountRef.current);
      }
      setEditForm((prev) => ({ ...prev, ...buildBillScanUpdates(data, prev, { fillTitle: false }) }));
      // Only attach the scanned image as the voucher's receipt if it doesn't
      // already have one — never replace an existing receipt (receipt-
      // substitution fix: the server rejects it anyway).
      if (!editVoucher?.receipt_url) setEditReceiptFile(file);
      toast.success(t("voucher.scan_bill_success"));
    } catch {
      toast.error(t("voucher.scan_bill_failed"));
    } finally {
      setEditScanning(false);
    }
  }

  async function handleEditScanPayment(file: File) {
    const voucherIdAtStart = editVoucherIdRef.current;
    setEditScanningPayment(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/payment-proof/extract-date", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || t("voucher.scan_payment_failed"));
        return;
      }
      const data = await res.json();
      if (data.date == null && data.transaction_id == null && data.amount == null && data.paid_to == null) {
        toast.error(t("voucher.scan_payment_unreadable"));
        return;
      }
      if (!editVoucherIdRef.current || editVoucherIdRef.current !== voucherIdAtStart) {
        toast.error(t("voucher.scan_stale_voucher"));
        return;
      }
      if (data.amount != null) {
        editScannedPaymentAmountRef.current = Number(data.amount);
        setEditScannedPaymentAmount(editScannedPaymentAmountRef.current);
      }
      const canFillAmount = editScannedBillAmountRef.current == null;
      setEditForm((prev) => ({ ...prev, ...buildPaymentScanUpdates(data, prev, canFillAmount) }));
      // Same rule as the bill scan: only attach if there's no existing proof.
      if (!editVoucher?.payment_proof_url) setEditPaymentProofFile(file);
      toast.success(t("voucher.scan_payment_success"));
    } catch {
      toast.error(t("voucher.scan_payment_failed"));
    } finally {
      setEditScanningPayment(false);
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
                <p className="text-sm font-medium">{t("voucher.scan_bill_title")}</p>
                <p className="text-xs text-muted-foreground">{t("voucher.scan_bill_desc")}</p>
              </div>
              <Button type="button" size="sm" variant="outline" disabled={scanning} onClick={() => scanInputRef.current?.click()}>
                {scanning ? <><Loader2 size={14} className="mr-1 animate-spin" /> {t("voucher.scanning")}</> : <><ScanLine size={14} className="mr-1" /> {t("voucher.scan_bill_button")}</>}
              </Button>
              <input ref={scanInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScanBill(f); e.target.value = ""; }} />
            </div>
            {/* Scan Payment Proof Button */}
            <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/10 border border-secondary/30">
              <ScanLine className="w-5 h-5 text-secondary-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{t("voucher.scan_payment_title")}</p>
                <p className="text-xs text-muted-foreground">{t("voucher.scan_payment_desc")}</p>
              </div>
              <Button type="button" size="sm" variant="outline" disabled={scanningPayment} onClick={() => scanPaymentInputRef.current?.click()}>
                {scanningPayment ? <><Loader2 size={14} className="mr-1 animate-spin" /> {t("voucher.scanning")}</> : <><ScanLine size={14} className="mr-1" /> {t("voucher.scan_payment_button")}</>}
              </Button>
              <input ref={scanPaymentInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScanPayment(f); e.target.value = ""; }} />
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Expense Title *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Travel to district meeting" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Amount (&#8377;) *</Label>
                  <Input type="number" step="1" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" required />
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
                <Label>Expense Event</Label>
                <Input value={form.expense_event} onChange={(e) => setForm({ ...form, expense_event: e.target.value })} placeholder="e.g. Annual District Meeting 2026" />
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

              {/* Payment details (optional) — populated by Scan Payment Proof or manual entry */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Payment Method</Label>
                  <Input value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} placeholder="e.g. UPI / Bank Transfer" />
                </div>
                <div>
                  <Label>Transaction ID</Label>
                  <Input value={form.payment_transaction_id} onChange={(e) => setForm({ ...form, payment_transaction_id: e.target.value })} placeholder="UTR / UPI ref" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Payment Date</Label>
                  <Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
                </div>
                <div>
                  <Label>Paid To</Label>
                  <Input value={form.paid_to} onChange={(e) => setForm({ ...form, paid_to: e.target.value })} placeholder="Recipient name" />
                </div>
              </div>
              <div>
                <Label>Payment Proof (optional)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => paymentFileInputRef.current?.click()}>
                    <Upload size={14} className="mr-1" />
                    {paymentProofFile ? paymentProofFile.name : "Upload Payment Proof"}
                  </Button>
                  {paymentProofFile && <Button type="button" variant="ghost" size="sm" onClick={() => setPaymentProofFile(null)}>Remove</Button>}
                </div>
                <input ref={paymentFileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setPaymentProofFile(e.target.files?.[0] || null)} />
              </div>

              {scannedBillAmount != null && scannedPaymentAmount != null && Math.abs(scannedBillAmount - scannedPaymentAmount) > 0.5 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  {t("voucher.amount_mismatch", {
                    bill: `₹${scannedBillAmount.toLocaleString("en-IN")}`,
                    payment: `₹${scannedPaymentAmount.toLocaleString("en-IN")}`,
                  })}
                </div>
              )}

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
                          {v.expense_event && <span className="text-xs text-muted-foreground">Event: {v.expense_event}</span>}
                          {v.vendor_name && <span className="text-xs text-muted-foreground">Vendor: {v.vendor_name}</span>}
                        </div>
                        {v.expense_date && <p className="text-xs text-muted-foreground mt-0.5">Expense date: {formatDate(v.expense_date)}</p>}
                        {(v.payment_method || v.payment_transaction_id || v.payment_date || v.paid_to) && (
                          <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
                            {v.payment_method && <span>Paid via {v.payment_method}</span>}
                            {v.payment_transaction_id && <span>Txn: {v.payment_transaction_id}</span>}
                            {v.payment_date && <span>on {formatDate(v.payment_date)}</span>}
                            {v.paid_to && <span>to {v.paid_to}</span>}
                          </div>
                        )}
                        {v.description && <p className="text-xs text-muted-foreground mt-1">{v.description}</p>}
                        <span className="text-xs text-muted-foreground mt-1 block">{formatDate(v.created_at)}</span>
                        <div className="flex items-center gap-3 mt-1">
                          {v.receipt_url && (
                            <button onClick={() => setPreviewUrl(v.receipt_url)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                              <Eye size={12} /> {t("voucher.view_receipt")}
                            </button>
                          )}
                          {v.payment_proof_url && (
                            <button onClick={() => setPreviewUrl(v.payment_proof_url)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                              <Eye size={12} /> {t("voucher.view_payment_proof")}
                            </button>
                          )}
                        </div>
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
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(v)}>
                          <Pencil size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0" onClick={() => handleDelete(v.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Voucher Dialog (own pending vouchers only) */}
      <Dialog
        open={!!editVoucher}
        onOpenChange={(open) => {
          if (!open) {
            // Clear synchronously so any scan still in flight sees the
            // dialog is closed and discards its result instead of writing
            // into whatever voucher is opened next.
            editVoucherIdRef.current = null;
            setEditVoucher(null);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Voucher</DialogTitle>
          </DialogHeader>
          {/* Scan Bill Button */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
            <ScanLine className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t("voucher.scan_bill_title")}</p>
              <p className="text-xs text-muted-foreground">{t("voucher.scan_bill_desc")}</p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={editScanning} onClick={() => editScanInputRef.current?.click()}>
              {editScanning ? <><Loader2 size={14} className="mr-1 animate-spin" /> {t("voucher.scanning")}</> : <><ScanLine size={14} className="mr-1" /> {t("voucher.scan_bill_button")}</>}
            </Button>
            <input ref={editScanInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEditScanBill(f); e.target.value = ""; }} />
          </div>
          {/* Scan Payment Proof Button */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/10 border border-secondary/30">
            <ScanLine className="w-5 h-5 text-secondary-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t("voucher.scan_payment_title")}</p>
              <p className="text-xs text-muted-foreground">{t("voucher.scan_payment_desc")}</p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={editScanningPayment} onClick={() => editScanPaymentInputRef.current?.click()}>
              {editScanningPayment ? <><Loader2 size={14} className="mr-1 animate-spin" /> {t("voucher.scanning")}</> : <><ScanLine size={14} className="mr-1" /> {t("voucher.scan_payment_button")}</>}
            </Button>
            <input ref={editScanPaymentInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEditScanPayment(f); e.target.value = ""; }} />
          </div>
          {editScannedBillAmount != null && editScannedPaymentAmount != null && Math.abs(editScannedBillAmount - editScannedPaymentAmount) > 0.5 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              {t("voucher.amount_mismatch", {
                bill: `₹${editScannedBillAmount.toLocaleString("en-IN")}`,
                payment: `₹${editScannedPaymentAmount.toLocaleString("en-IN")}`,
              })}
            </div>
          )}
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <Label>Expense Title *</Label>
              <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (&#8377;) *</Label>
                <Input type="number" step="1" min="1" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} required />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={editForm.category} onValueChange={(val) => setEditForm({ ...editForm, category: val })}>
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
                <Input value={editForm.invoice_number} onChange={(e) => setEditForm({ ...editForm, invoice_number: e.target.value })} />
              </div>
              <div>
                <Label>Vendor / Payee</Label>
                <Input value={editForm.vendor_name} onChange={(e) => setEditForm({ ...editForm, vendor_name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date of Expense</Label>
                <Input type="date" value={editForm.expense_date} onChange={(e) => setEditForm({ ...editForm, expense_date: e.target.value })} />
              </div>
              <div>
                <Label>Expense Event</Label>
                <Input value={editForm.expense_event} onChange={(e) => setEditForm({ ...editForm, expense_event: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} />
            </div>
            {/* Only shown when this voucher has no receipt yet — an existing
                one can never be replaced here (receipt-substitution fix). */}
            {!editVoucher?.receipt_url && (
              <div>
                <Label>Receipt / Invoice (optional)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => editFileInputRef.current?.click()}>
                    <Upload size={14} className="mr-1" />
                    {editReceiptFile ? editReceiptFile.name : "Upload Receipt"}
                  </Button>
                  {editReceiptFile && <Button type="button" variant="ghost" size="sm" onClick={() => setEditReceiptFile(null)}>Remove</Button>}
                </div>
                <input ref={editFileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setEditReceiptFile(e.target.files?.[0] || null)} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment Method</Label>
                <Input value={editForm.payment_method} onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })} />
              </div>
              <div>
                <Label>Transaction ID</Label>
                <Input value={editForm.payment_transaction_id} onChange={(e) => setEditForm({ ...editForm, payment_transaction_id: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment Date</Label>
                <Input type="date" value={editForm.payment_date} onChange={(e) => setEditForm({ ...editForm, payment_date: e.target.value })} />
              </div>
              <div>
                <Label>Paid To</Label>
                <Input value={editForm.paid_to} onChange={(e) => setEditForm({ ...editForm, paid_to: e.target.value })} />
              </div>
            </div>
            {!editVoucher?.payment_proof_url && (
              <div>
                <Label>Payment Proof (optional)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => editPaymentFileInputRef.current?.click()}>
                    <Upload size={14} className="mr-1" />
                    {editPaymentProofFile ? editPaymentProofFile.name : "Upload Payment Proof"}
                  </Button>
                  {editPaymentProofFile && <Button type="button" variant="ghost" size="sm" onClick={() => setEditPaymentProofFile(null)}>Remove</Button>}
                </div>
                <input ref={editPaymentFileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setEditPaymentProofFile(e.target.files?.[0] || null)} />
              </div>
            )}
            <Button type="submit" disabled={savingEdit} className="w-full bg-primary hover:bg-primary/90">
              {savingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
