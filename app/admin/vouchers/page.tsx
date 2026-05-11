"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Receipt, Trash2, IndianRupee, CheckCircle2, XCircle, Eye, Plus, Upload, CheckSquare, Square, MinusSquare, AlertTriangle, Download, Mail, ScanLine, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import { formatDate } from "@/lib/utils";
import { FinanceOtpGate } from "@/components/finance-otp-gate";

const expenseCategories = ["Travel", "Printing", "Food & Refreshments", "Stationery", "Communication", "Venue & Hall", "Transport", "Miscellaneous"];
const HIGH_AMOUNT_THRESHOLD = 10000;

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
  payment_proof_url: string | null;
  payment_method: string;
  payment_transaction_id: string;
  payment_date: string | null;
  paid_to: string;
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

  // Create voucher
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "", amount: "", description: "", invoice_number: "", vendor_name: "", expense_date: "", category: "",
    payment_method: "", payment_transaction_id: "", payment_date: "", paid_to: "",
  });
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [createPaymentFile, setCreatePaymentFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanningPayment, setScanningPayment] = useState(false);
  // scanned amounts mirror the member dialog — see app/dashboard/vouchers/page.tsx
  const [scannedBillAmount, setScannedBillAmount] = useState<number | null>(null);
  const [scannedPaymentAmount, setScannedPaymentAmount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const paymentFileInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scanPaymentInputRef = useRef<HTMLInputElement>(null);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, setBulkLoading] = useState(false);
  // Officials list for "on behalf of"
  const [officials, setOfficials] = useState<{ id: string; name: string; email: string; official_type: string }[]>([]);
  const [selectedOfficial, setSelectedOfficial] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setSelected(new Set());
    fetch("/api/vouchers?status=" + tab)
      .then((r) => r.json())
      .then((d) => setVouchers(d.vouchers || []))
      .catch(() => toast.error("Failed to load vouchers"))
      .finally(() => setLoading(false));
  }, [tab]);

  function loadOfficials() {
    if (officials.length > 0) return;
    fetch("/api/users?status=approved")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.users || [])
          .filter((u: { official_type: string | null }) => u.official_type === "state" || u.official_type === "district")
          .map((u: { id: string; name: string; email: string; official_type: string }) => ({ id: u.id, name: u.name, email: u.email, official_type: u.official_type }));
        setOfficials(list);
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, [load]);

  async function uploadFile(file: File): Promise<string | null> {
    const formData = new FormData();
    formData.append("file", file);
    const uploadRes = await fetch("/api/upload/document", { method: "POST", body: formData });
    const uploadData = await uploadRes.json();
    if (uploadRes.ok) return uploadData.url || uploadData.file_url;
    return null;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);

    let receiptUrl: string | null = null;
    if (createFile) {
      receiptUrl = await uploadFile(createFile);
      if (!receiptUrl) {
        toast.error("Failed to upload receipt");
        setCreating(false);
        return;
      }
    }
    let paymentProofUrl: string | null = null;
    if (createPaymentFile) {
      paymentProofUrl = await uploadFile(createPaymentFile);
      if (!paymentProofUrl) {
        toast.error("Failed to upload payment proof");
        setCreating(false);
        return;
      }
    }

    const submittedBy = selectedOfficial && selectedOfficial !== "self" ? selectedOfficial : undefined;

    const res = await fetch("/api/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: createForm.title,
        amount: parseFloat(createForm.amount) || 0,
        description: createForm.description,
        invoice_number: createForm.invoice_number,
        vendor_name: createForm.vendor_name,
        expense_date: createForm.expense_date || null,
        category: createForm.category,
        receipt_url: receiptUrl,
        payment_proof_url: paymentProofUrl,
        payment_method: createForm.payment_method,
        payment_transaction_id: createForm.payment_transaction_id,
        payment_date: createForm.payment_date || null,
        paid_to: createForm.paid_to,
        ...(submittedBy ? { submitted_by: submittedBy } : {}),
      }),
    });

    if (res.ok) {
      toast.success("Voucher created");
      setCreateOpen(false);
      setCreateForm({
        title: "", amount: "", description: "", invoice_number: "", vendor_name: "", expense_date: "", category: "",
        payment_method: "", payment_transaction_id: "", payment_date: "", paid_to: "",
      });
      setCreateFile(null);
      setCreatePaymentFile(null);
      setScannedBillAmount(null);
      setScannedPaymentAmount(null);
      setSelectedOfficial("");
      load();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to create");
    }
    setCreating(false);
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
      const updates = { ...createForm };
      if (data.vendor_name) {
        updates.vendor_name = data.vendor_name;
        if (!createForm.title) updates.title = `${data.vendor_name} expense`;
      }
      if (data.total_amount != null) {
        updates.amount = String(data.total_amount);
        setScannedBillAmount(Number(data.total_amount));
      }
      if (data.invoice_number) updates.invoice_number = data.invoice_number;
      if (data.category) {
        const matched = expenseCategories.find((c) => c.toLowerCase().includes(String(data.category).toLowerCase()));
        if (matched) updates.category = matched;
      }
      if (data.date) {
        const parts = String(data.date).split("/");
        if (parts.length === 3) {
          updates.expense_date = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
      }
      const descParts: string[] = [];
      if (data.items?.length) {
        descParts.push((data.items as { description: string; quantity?: number; amount?: number }[])
          .map((it) => `${it.description}${it.quantity ? ` x${it.quantity}` : ""}${it.amount != null ? ` - ₹${it.amount}` : ""}`)
          .join("\n"));
      }
      if (data.tax != null) descParts.push(`Tax/GST: ₹${data.tax}`);
      if (data.payment_method) descParts.push(`Payment: ${data.payment_method}`);
      if (data.notes) descParts.push(data.notes);
      if (descParts.length) updates.description = descParts.join("\n");
      setCreateForm(updates);
      setCreateFile(file);
      toast.success("Bill scanned! Fields auto-filled.");
    } catch {
      toast.error("Failed to scan bill");
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
        toast.error(data.error || "Failed to scan payment proof");
        return;
      }
      const data = await res.json();
      if (data.date == null && data.transaction_id == null && data.amount == null && data.paid_to == null) {
        toast.error("Could not read payment details from this image.");
        return;
      }
      const updates = { ...createForm };
      if (data.payment_method) updates.payment_method = data.payment_method;
      if (data.transaction_id) updates.payment_transaction_id = data.transaction_id;
      if (data.date) updates.payment_date = data.date;
      if (data.paid_to) updates.paid_to = data.paid_to;
      if (data.amount != null) {
        setScannedPaymentAmount(Number(data.amount));
        if (scannedBillAmount == null && !createForm.amount) {
          updates.amount = String(data.amount);
        }
      }
      setCreateForm(updates);
      setCreatePaymentFile(file);
      toast.success("Payment proof scanned! Fields auto-filled.");
    } catch {
      toast.error("Failed to scan payment proof");
    } finally {
      setScanningPayment(false);
    }
  }

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

  // Bulk selection helpers
  const pendingVouchers = vouchers.filter((v) => v.status === "pending");
  const selectableIds = pendingVouchers.map((v) => v.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelected = selectableIds.some((id) => selected.has(id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIds));
    }
  }

  async function handleBulkAction(status: "approved" | "rejected") {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`${status === "approved" ? "Approve" : "Reject"} ${ids.length} voucher(s)?`)) return;

    setBulkLoading(true);
    const res = await fetch("/api/vouchers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    });
    if (res.ok) {
      toast.success(`${ids.length} voucher(s) ${status}`);
      load();
    } else {
      toast.error("Bulk action failed");
    }
    setBulkLoading(false);
  }

  const totalPending = vouchers.filter((v) => v.status === "pending").reduce((sum, v) => sum + (v.amount || 0), 0);

  function downloadVoucherPdf(v: Voucher) {
    const doc = new jsPDF();
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const statusLabel = v.status === "approved" ? "APPROVED" : v.status === "rejected" ? "REJECTED" : "PENDING";

    // Header
    doc.setFontSize(20);
    doc.setTextColor(45, 106, 79);
    doc.setFont("helvetica", "bold");
    doc.text("TANHOWA", 105, 18, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text("Tamil Nadu Horticultural Officers Welfare Association", 105, 25, { align: "center" });
    doc.setFontSize(12);
    doc.setTextColor(45, 106, 79);
    doc.setFont("helvetica", "bold");
    doc.text("EXPENSE VOUCHER", 105, 33, { align: "center" });

    // Voucher number & date
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(`Voucher #: ${v.id.substring(0, 8).toUpperCase()}`, 25, 40);
    doc.text(`Date: ${today}`, 190, 40, { align: "right" });

    doc.setDrawColor(45, 106, 79);
    doc.setLineWidth(0.5);
    doc.line(20, 43, 190, 43);

    // Official details
    let y = 52;
    doc.setFontSize(9);
    doc.setTextColor(45, 106, 79);
    doc.setFont("helvetica", "bold");
    doc.text("SUBMITTED BY", 25, y);
    y += 7;

    doc.setFontSize(10);
    doc.setTextColor(0);
    const officialRows: [string, string][] = [];
    if (v.submitter?.name) officialRows.push(["Name", v.submitter.name]);
    if (v.submitter?.email) officialRows.push(["Email", v.submitter.email]);
    if (v.submitter?.phone) officialRows.push(["Phone", v.submitter.phone]);
    if (v.submitter?.official_type) officialRows.push(["Type", v.submitter.official_type === "state" ? "State Official" : "District Official"]);
    for (const [label, value] of officialRows) {
      doc.setFont("helvetica", "bold");
      doc.text(label, 25, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, 80, y);
      y += 7;
    }

    // Expense details
    y += 3;
    doc.setDrawColor(220);
    doc.setLineWidth(0.2);
    doc.line(20, y, 190, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(45, 106, 79);
    doc.setFont("helvetica", "bold");
    doc.text("EXPENSE DETAILS", 25, y);
    y += 7;

    doc.setFontSize(10);
    doc.setTextColor(0);
    const expenseRows: [string, string][] = [
      ["Title", v.title],
      ["Amount", `Rs. ${(v.amount || 0).toLocaleString("en-IN")}`],
    ];
    if (v.category) expenseRows.push(["Category", v.category]);
    if (v.invoice_number) expenseRows.push(["Invoice No.", v.invoice_number]);
    if (v.vendor_name) expenseRows.push(["Vendor / Payee", v.vendor_name]);
    if (v.expense_date) {
      expenseRows.push(["Expense Date", new Date(v.expense_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })]);
    }
    if (v.payment_method) expenseRows.push(["Payment Method", v.payment_method]);
    if (v.payment_transaction_id) expenseRows.push(["Transaction ID", v.payment_transaction_id]);
    if (v.payment_date) {
      expenseRows.push(["Payment Date", new Date(v.payment_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })]);
    }
    if (v.paid_to) expenseRows.push(["Paid To", v.paid_to]);
    expenseRows.push(["Submitted On", formatDate(v.created_at)]);
    expenseRows.push(["Status", statusLabel]);
    if (v.approver?.name) expenseRows.push(["Approved By", v.approver.name]);
    if (v.approved_at) {
      expenseRows.push(["Approved Date", new Date(v.approved_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })]);
    }

    for (const [label, value] of expenseRows) {
      doc.setFont("helvetica", "bold");
      doc.text(label, 25, y);
      doc.setFont("helvetica", "normal");
      if (label === "Status") {
        if (v.status === "approved") doc.setTextColor(34, 139, 34);
        else if (v.status === "rejected") doc.setTextColor(220, 38, 38);
        else doc.setTextColor(180, 130, 0);
        doc.setFont("helvetica", "bold");
      }
      doc.text(value, 80, y);
      doc.setTextColor(0);
      y += 7;
    }

    // Description
    if (v.description) {
      y += 3;
      doc.setDrawColor(220);
      doc.setLineWidth(0.2);
      doc.line(20, y, 190, y);
      y += 7;
      doc.setFontSize(9);
      doc.setTextColor(45, 106, 79);
      doc.setFont("helvetica", "bold");
      doc.text("DESCRIPTION", 25, y);
      y += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60);
      const descLines = doc.splitTextToSize(v.description, 160);
      for (const line of descLines) {
        doc.text(line, 25, y);
        y += 5;
      }
    }

    // Admin remarks
    if (v.remarks) {
      y += 3;
      doc.setDrawColor(220);
      doc.setLineWidth(0.2);
      doc.line(20, y, 190, y);
      y += 7;
      doc.setFontSize(9);
      doc.setTextColor(45, 106, 79);
      doc.setFont("helvetica", "bold");
      doc.text("ADMIN REMARKS", 25, y);
      y += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60);
      const remarkLines = doc.splitTextToSize(v.remarks, 160);
      for (const line of remarkLines) {
        doc.text(line, 25, y);
        y += 5;
      }
    }

    // Signature
    y += 8;
    doc.setDrawColor(45, 106, 79);
    doc.setLineWidth(0.3);
    doc.line(20, y, 190, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(45, 106, 79);
    doc.setFont("helvetica", "bold");
    doc.text("President", 105, y, { align: "center" });
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Tamil Nadu Horticultural Officers Welfare Association", 105, y, { align: "center" });

    // Footer
    y += 12;
    doc.setDrawColor(200);
    doc.line(20, y, 190, y);
    y += 5;
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on ${today} from tanhowa.in`, 105, y, { align: "center" });
    doc.text("This is a computer-generated document and does not require a signature.", 105, y + 4, { align: "center" });

    doc.save(`TANHOWA-Voucher-${v.id.substring(0, 8).toUpperCase()}.pdf`);
  }

  async function handleEmailVoucher(id: string) {
    const res = await fetch("/api/vouchers/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      toast.success("Voucher PDF emailed to official");
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error || "Failed to send email");
    }
  }

  return (
    <FinanceOtpGate>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Expense Vouchers</h1>
            <p className="text-sm text-muted-foreground">Review and approve expense claims from officials</p>
          </div>
        </div>
        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (open) loadOfficials(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-1" />
              Create Voucher
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Expense Voucher</DialogTitle>
            </DialogHeader>
            {/* Scan Bill */}
            <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
              <ScanLine className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Scan a bill to auto-fill</p>
                <p className="text-xs text-muted-foreground">Receipt/invoice image — AI extracts vendor, amount, items</p>
              </div>
              <Button type="button" size="sm" variant="outline" disabled={scanning} onClick={() => scanInputRef.current?.click()}>
                {scanning ? <><Loader2 size={14} className="mr-1 animate-spin" /> Scanning...</> : <><ScanLine size={14} className="mr-1" /> Scan Bill</>}
              </Button>
              <input ref={scanInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScanBill(f); e.target.value = ""; }} />
            </div>
            {/* Scan Payment Proof */}
            <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/10 border border-secondary/30">
              <ScanLine className="w-5 h-5 text-secondary-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Scan a payment screenshot</p>
                <p className="text-xs text-muted-foreground">UPI/bank screenshot — extracts txn ID, payment date, payee, method</p>
              </div>
              <Button type="button" size="sm" variant="outline" disabled={scanningPayment} onClick={() => scanPaymentInputRef.current?.click()}>
                {scanningPayment ? <><Loader2 size={14} className="mr-1 animate-spin" /> Scanning...</> : <><ScanLine size={14} className="mr-1" /> Scan Payment</>}
              </Button>
              <input ref={scanPaymentInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScanPayment(f); e.target.value = ""; }} />
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>On behalf of (official)</Label>
                <Select value={selectedOfficial} onValueChange={setSelectedOfficial}>
                  <SelectTrigger>
                    <SelectValue placeholder="Self (admin)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Self (admin)</SelectItem>
                    {officials.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name} ({o.official_type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expense Title *</Label>
                <Input value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} placeholder="e.g. Travel to district meeting" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Amount (&#8377;) *</Label>
                  <Input type="number" value={createForm.amount} onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })} placeholder="0" required />
                  {parseFloat(createForm.amount) > HIGH_AMOUNT_THRESHOLD && (
                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                      <AlertTriangle size={12} /> High amount — ensure receipt is attached
                    </p>
                  )}
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={createForm.category} onValueChange={(val) => setCreateForm({ ...createForm, category: val })}>
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
                  <Input value={createForm.invoice_number} onChange={(e) => setCreateForm({ ...createForm, invoice_number: e.target.value })} placeholder="e.g. INV-2026-001" />
                </div>
                <div>
                  <Label>Vendor / Payee</Label>
                  <Input value={createForm.vendor_name} onChange={(e) => setCreateForm({ ...createForm, vendor_name: e.target.value })} placeholder="e.g. ABC Travels" />
                </div>
              </div>
              <div>
                <Label>Date of Expense</Label>
                <Input type="date" value={createForm.expense_date} onChange={(e) => setCreateForm({ ...createForm, expense_date: e.target.value })} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="Details about the expense" rows={2} />
              </div>
              <div>
                <Label>Receipt / Invoice (optional)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={14} className="mr-1" />
                    {createFile ? createFile.name : "Upload"}
                  </Button>
                  {createFile && <Button type="button" variant="ghost" size="sm" onClick={() => setCreateFile(null)}>Remove</Button>}
                </div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setCreateFile(e.target.files?.[0] || null)} />
              </div>

              {/* Payment details (optional) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Payment Method</Label>
                  <Input value={createForm.payment_method} onChange={(e) => setCreateForm({ ...createForm, payment_method: e.target.value })} placeholder="e.g. UPI / Bank Transfer" />
                </div>
                <div>
                  <Label>Transaction ID</Label>
                  <Input value={createForm.payment_transaction_id} onChange={(e) => setCreateForm({ ...createForm, payment_transaction_id: e.target.value })} placeholder="UTR / UPI ref" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Payment Date</Label>
                  <Input type="date" value={createForm.payment_date} onChange={(e) => setCreateForm({ ...createForm, payment_date: e.target.value })} />
                </div>
                <div>
                  <Label>Paid To</Label>
                  <Input value={createForm.paid_to} onChange={(e) => setCreateForm({ ...createForm, paid_to: e.target.value })} placeholder="Recipient name" />
                </div>
              </div>
              <div>
                <Label>Payment Proof (optional)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => paymentFileInputRef.current?.click()}>
                    <Upload size={14} className="mr-1" />
                    {createPaymentFile ? createPaymentFile.name : "Upload Payment Proof"}
                  </Button>
                  {createPaymentFile && <Button type="button" variant="ghost" size="sm" onClick={() => setCreatePaymentFile(null)}>Remove</Button>}
                </div>
                <input ref={paymentFileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setCreatePaymentFile(e.target.files?.[0] || null)} />
              </div>

              {scannedBillAmount != null && scannedPaymentAmount != null && Math.abs(scannedBillAmount - scannedPaymentAmount) > 0.5 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <strong>Amount mismatch:</strong> bill shows &#8377;{scannedBillAmount.toLocaleString("en-IN")} but payment shows &#8377;{scannedPaymentAmount.toLocaleString("en-IN")}. Verify before saving.
                </div>
              )}

              <Button type="submit" disabled={creating} className="w-full bg-primary hover:bg-primary/90">
                {creating ? "Creating..." : "Create Voucher"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <button onClick={toggleSelectAll} className="text-primary hover:text-primary/80 shrink-0" title={allSelected ? "Deselect all" : "Select all pending"}>
                          {allSelected ? <CheckSquare size={18} /> : someSelected ? <MinusSquare size={18} /> : <Square size={18} />}
                        </button>
                        <p className="text-sm text-muted-foreground">
                          Pending approval total: <span className="font-bold text-foreground">&#8377;{totalPending.toLocaleString("en-IN")}</span>
                          {selected.size > 0 && <span className="ml-2 text-primary font-medium">({selected.size} selected)</span>}
                        </p>
                      </div>
                      {selected.size > 0 && (
                        <div className="flex items-center gap-2">
                          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => handleBulkAction("approved")}>
                            <CheckCircle2 size={12} className="mr-1" /> Approve ({selected.size})
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300 hover:bg-red-50" onClick={() => handleBulkAction("rejected")}>
                            <XCircle size={12} className="mr-1" /> Reject ({selected.size})
                          </Button>
                        </div>
                      )}
                    </div>
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
                            {v.status === "pending" && (
                              <button onClick={() => toggleSelect(v.id)} className="mt-2.5 text-primary hover:text-primary/80 shrink-0">
                                {selected.has(v.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                              </button>
                            )}
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Receipt className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-medium text-sm">{v.title}</h3>
                                <Badge variant="outline" className={config.color}>{config.label}</Badge>
                                {v.category && <Badge variant="outline" className="text-[10px]">{v.category}</Badge>}
                                {v.submitter?.official_type && (
                                  <Badge variant="outline" className={v.submitter.official_type === "state" ? "bg-purple-50 text-purple-700 border-purple-300 text-[10px]" : "bg-blue-50 text-blue-700 border-blue-300 text-[10px]"}>
                                    {v.submitter.official_type === "state" ? "State" : "District"} Official
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-sm font-semibold flex items-center gap-0.5">
                                  <IndianRupee size={12} />
                                  {v.amount?.toLocaleString("en-IN") || 0}
                                </span>
                                {v.amount > HIGH_AMOUNT_THRESHOLD && (
                                  <span className="text-xs text-amber-600 flex items-center gap-0.5" title={`Amount exceeds ₹${HIGH_AMOUNT_THRESHOLD.toLocaleString("en-IN")} threshold`}>
                                    <AlertTriangle size={12} /> High
                                  </span>
                                )}
                                {v.amount > HIGH_AMOUNT_THRESHOLD && !v.receipt_url && v.status === "pending" && (
                                  <span className="text-xs text-red-600 flex items-center gap-0.5">No receipt</span>
                                )}
                                {v.invoice_number && <span className="text-xs text-muted-foreground">Invoice: {v.invoice_number}</span>}
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
                              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                {v.submitter?.name && <span className="text-xs text-muted-foreground uppercase">by {v.submitter.name}</span>}
                                <span className="text-xs text-muted-foreground">{formatDate(v.created_at)}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-1">
                                {v.receipt_url && (
                                  <button onClick={() => setPreviewUrl(v.receipt_url)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                                    <Eye size={12} /> View receipt
                                  </button>
                                )}
                                {v.payment_proof_url && (
                                  <button onClick={() => setPreviewUrl(v.payment_proof_url)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                                    <Eye size={12} /> View payment proof
                                  </button>
                                )}
                              </div>
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
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Download PDF" onClick={() => downloadVoucherPdf(v)}>
                              <Download size={14} />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Email PDF to official" onClick={() => handleEmailVoucher(v.id)}>
                              <Mail size={14} />
                            </Button>
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
                          <Button size="sm" variant="outline" className="mt-1.5" onClick={() => handleSaveRemarks(v.id)}>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receipt</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="rounded-xl overflow-hidden border">
              {previewUrl.toLowerCase().includes(".pdf") ? (
                <iframe src={previewUrl} className="w-full h-[70vh]" title="Receipt PDF" />
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Receipt" className="w-full" />
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
    </FinanceOtpGate>
  );
}
