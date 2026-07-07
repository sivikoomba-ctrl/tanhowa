"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Wallet, CheckCircle2, Clock, AlertTriangle, PauseCircle, Upload, QrCode, ImageIcon, Eye, Edit2, Users, Info, User, Search, X, IndianRupee, FileDown, Mail, Leaf, Save, Calculator, ScanLine, Trash2, Plus } from "lucide-react";
import jsPDF from "jspdf";
import { formatDate, formatDateTime } from "@/lib/utils";
import { MetricCard } from "@/components/metric-card";
import { statusStyles } from "@/components/status-badge";
import { fetchSignedPaymentProofUrl } from "@/lib/subscription-proofs";
import { isFlexibleAmount } from "@/lib/subscriptions";
import { PaymentProofPreviewDialog } from "@/components/payment-proof-preview-dialog";
import { useT } from "@/lib/i18n";

interface PendingMember {
  id: string;
  user_id: string;
  period: string;
  amount: number;
  status: string;
  users: { id: string; name: string; email: string; phone: string } | null;
}

interface MemberInfo {
  name: string;
  email: string;
  phone: string;
  occupation: string;
  avatar_url: string | null;
  posting_details?: { regular_district?: string; block?: string };
  social_links?: { dues_summary?: { amount_paid?: number; additional_money?: number; proof_url?: string; proofs?: { url: string; date: string }[] }; [key: string]: unknown };
}

interface Subscription {
  id: string;
  period: string;
  amount: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  transaction_id: string | null;
  payment_proof_url: string | null;
  remarks: string | null;
  paid_amount: number | null;
  created_at: string;
  description?: string | null;
  flexible_amount?: boolean | null;
}

const statusIcons: Record<string, typeof CheckCircle2> = {
  paid: CheckCircle2,
  pending: Clock,
  overdue: AlertTriangle,
  rejected: AlertTriangle,
  hold: PauseCircle,
};

function getSubStatusConfig(status: string) {
  const style = statusStyles[status] || { label: status, color: "bg-gray-100 text-gray-700" };
  return { ...style, icon: statusIcons[status] || Clock };
}

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [upiId, setUpiId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);

  // Payment details dialog
  const [detailsSub, setDetailsSub] = useState<Subscription | null>(null);
  const [detailsForm, setDetailsForm] = useState({ transaction_id: "", payment_method: "", remarks: "", paying_for_others: false, other_members: "", amount: "" });
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [isNewUpload, setIsNewUpload] = useState(false);
  const [qrZoom, setQrZoom] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [member, setMember] = useState<MemberInfo | null>(null);
  const t = useT();

  // Association Due Summary
  const [duesPaid, setDuesPaid] = useState("");
  const [duesAdditional, setDuesAdditional] = useState("");
  const [duesSaving, setDuesSaving] = useState(false);
  const [duesLoaded, setDuesLoaded] = useState(false);
  const [duesProofs, setDuesProofs] = useState<{ url: string; date: string }[]>([]);
  const [duesProofUploading, setDuesProofUploading] = useState(false);
  const duesFileRef = useRef<HTMLInputElement>(null);
  const [duesProofPreview, setDuesProofPreview] = useState<string | null>(null);
  const [detailsProofSignedUrl, setDetailsProofSignedUrl] = useState<string | null>(null);

  // Voluntary-fund "Add Contribution" dialog
  const [contribFund, setContribFund] = useState<string | null>(null);
  const [contribAmount, setContribAmount] = useState("");
  const [contribSaving, setContribSaving] = useState(false);

  // Combined / split payment dialog
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitSelected, setSplitSelected] = useState<Set<string>>(new Set());
  const [splitRefund, setSplitRefund] = useState("");
  const [splitTxn, setSplitTxn] = useState("");
  const [splitMethod, setSplitMethod] = useState("UPI");
  const [splitProofUrl, setSplitProofUrl] = useState<string | null>(null);
  const [splitUploading, setSplitUploading] = useState(false);
  const [splitSaving, setSplitSaving] = useState(false);
  const splitFileRef = useRef<HTMLInputElement>(null);

  async function handleSplitProofUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Need a subscription_id we own for the upload — use a selected due, else the flex fund row
    const ownId = Array.from(splitSelected)[0]
      || subscriptions.find((s) => isFlexibleAmount(s) && s.status !== "paid")?.id;
    if (!ownId) { toast.error("Select at least one item first"); return; }
    setSplitUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("subscription_id", ownId);
      const res = await fetch("/api/upload/payment-proof", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) { setSplitProofUrl(data.payment_proof_url); toast.success("Proof attached"); }
      else toast.error(data.error || "Upload failed");
    } catch { toast.error("Upload failed"); }
    finally { setSplitUploading(false); if (splitFileRef.current) splitFileRef.current.value = ""; }
  }

  async function handleSubmitSplit() {
    const refundNum = parseFloat(splitRefund) || 0;
    const items = splitSelected.size + (refundNum > 0 ? 1 : 0);
    if (items < 2) { toast.error("Select at least two items to combine"); return; }
    if (!splitProofUrl) { toast.error("Attach your payment proof"); return; }
    setSplitSaving(true);
    try {
      const flexPeriod = subscriptions.find((s) => isFlexibleAmount(s))?.period || null;
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "split-payment",
          due_ids: Array.from(splitSelected),
          flexible_period: refundNum > 0 ? flexPeriod : null,
          flexible_amount: refundNum > 0 ? refundNum : null,
          transaction_id: splitTxn,
          payment_method: splitMethod,
          payment_proof_url: splitProofUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to submit"); return; }
      toast.success(`Combined payment submitted (${data.count} items) — awaiting verification.`);
      setSplitOpen(false);
      setSplitSelected(new Set()); setSplitRefund(""); setSplitTxn(""); setSplitProofUrl(null);
      load();
    } catch { toast.error("Failed to submit"); }
    finally { setSplitSaving(false); }
  }

  async function handleAddContribution() {
    if (!contribFund) return;
    const amt = parseFloat(contribAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Enter a valid contribution amount");
      return;
    }
    setContribSaving(true);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-contribution", period: contribFund, amount: amt }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to add contribution");
        return;
      }
      toast.success("Contribution added — now upload your payment proof on the new entry.");
      setContribFund(null);
      setContribAmount("");
      load();
    } catch {
      toast.error("Failed to add contribution");
    } finally {
      setContribSaving(false);
    }
  }

  async function handleRescan() {
    if (!detailsProofSignedUrl) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("image_url", detailsProofSignedUrl);
      const res = await fetch("/api/upload/payment-proof/extract-date", { method: "POST", body: fd });
      const data = await res.json();
      if (data.transaction_id || data.payment_method || data.amount) {
        setDetailsForm((prev) => ({
          ...prev,
          transaction_id: data.transaction_id || prev.transaction_id,
          payment_method: data.payment_method || prev.payment_method,
          ...(data.amount ? { amount: String(data.amount) } : {}),
        }));
        toast.success("Details extracted from proof.");
      } else {
        toast.info("Could not extract details. Please fill in manually.");
      }
    } catch {
      toast.error("Re-scan failed.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleRemoveProof() {
    if (!detailsSub) return;
    setDetailsSaving(true);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detailsSub.id, payment_proof_url: "" }),
      });
      if (res.ok) {
        toast.success("Proof removed. You can upload a new one.");
        setDetailsSub({ ...detailsSub, payment_proof_url: null });
        setDetailsProofSignedUrl(null);
        load();
      } else {
        toast.error("Failed to remove proof");
      }
    } catch {
      toast.error("Failed to remove proof");
    }
    setDetailsSaving(false);
  }

  function downloadReceipt(sub: Subscription) {
    const doc = new jsPDF();
    const name = member?.name || "Member";
    const email = member?.email || "";
    const phone = member?.phone || "";
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const paidDate = sub.paid_at ? new Date(sub.paid_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

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
    doc.text("PAYMENT RECEIPT", 105, 33, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(`Receipt #: ${sub.id.substring(0, 8).toUpperCase()}`, 25, 40);
    doc.text(`Date: ${today}`, 190, 40, { align: "right" });

    doc.setDrawColor(45, 106, 79);
    doc.setLineWidth(0.5);
    doc.line(20, 43, 190, 43);

    // Member details
    let y = 52;
    doc.setFontSize(9);
    doc.setTextColor(45, 106, 79);
    doc.setFont("helvetica", "bold");
    doc.text("MEMBER DETAILS", 25, y);
    y += 7;

    doc.setFontSize(10);
    doc.setTextColor(0);
    const memberRows: [string, string][] = [
      ["Name", name],
      ["Email", email],
      ["Phone", phone],
    ];
    for (const [label, value] of memberRows) {
      if (!value) continue;
      doc.setFont("helvetica", "bold");
      doc.text(label, 25, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, 80, y);
      y += 7;
    }

    // Payment details
    y += 3;
    doc.setDrawColor(220);
    doc.setLineWidth(0.2);
    doc.line(20, y, 190, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(45, 106, 79);
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT DETAILS", 25, y);
    y += 7;

    doc.setFontSize(10);
    doc.setTextColor(0);
    const payRows: [string, string][] = [
      ["Subscription Period", sub.period],
      ["Subscription Amount", `Rs. ${(sub.amount || 0).toLocaleString("en-IN")}`],
    ];
    if (sub.paid_amount && sub.paid_amount !== sub.amount) {
      payRows.push(["Amount Paid", `Rs. ${sub.paid_amount.toLocaleString("en-IN")}`]);
      if (sub.paid_amount > (sub.amount || 0)) {
        payRows.push(["Extra Amount", `Rs. ${(sub.paid_amount - (sub.amount || 0)).toLocaleString("en-IN")}`]);
      }
    }
    payRows.push(["Status", "PAID"]);
    if (sub.payment_method) payRows.push(["Payment Method", sub.payment_method]);
    if (sub.transaction_id) payRows.push(["Transaction ID", sub.transaction_id]);
    if (paidDate) payRows.push(["Payment Date", paidDate]);

    for (const [label, value] of payRows) {
      doc.setFont("helvetica", "bold");
      doc.text(label, 25, y);
      doc.setFont("helvetica", "normal");
      if (label === "Status") {
        doc.setTextColor(34, 139, 34);
        doc.setFont("helvetica", "bold");
      }
      doc.text(value, 80, y);
      doc.setTextColor(0);
      y += 7;
    }

    // Verification
    if (sub.remarks) {
      y += 3;
      doc.setDrawColor(220);
      doc.setLineWidth(0.2);
      doc.line(20, y, 190, y);
      y += 7;
      doc.setFontSize(9);
      doc.setTextColor(45, 106, 79);
      doc.setFont("helvetica", "bold");
      doc.text("VERIFICATION", 25, y);
      y += 6;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60);
      const remarkLines = doc.splitTextToSize(sub.remarks, 160);
      for (const line of remarkLines) {
        doc.text(line, 25, y);
        y += 4;
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

    // Slogan
    y += 12;
    doc.setFontSize(12);
    doc.setTextColor(34, 139, 34);
    doc.setFont("helvetica", "bold");
    doc.text("Save a print, Save a Tree.", 105, y, { align: "center" });

    // Footer
    y += 10;
    doc.setDrawColor(200);
    doc.line(20, y, 190, y);
    y += 5;
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.setFont("helvetica", "normal");
    doc.text(`Receipt #${sub.id.substring(0, 8).toUpperCase()} | Generated on ${today} from tanhowa.in`, 105, y, { align: "center" });
    doc.text("This is a computer-generated receipt and does not require a physical signature.", 105, y + 3.5, { align: "center" });

    doc.save(`TANHOWA-Receipt-${name.replace(/\s+/g, "-")}-${sub.period.replace(/\s+/g, "-")}.pdf`);
  }

  const [emailingSub, setEmailingSub] = useState<string | null>(null);

  async function emailReceipt(sub: Subscription) {
    setEmailingSub(sub.id);
    try {
      const res = await fetch("/api/subscriptions/email-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: sub.id }),
      });
      if (res.ok) {
        toast.success("Receipt emailed successfully!");
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to email receipt");
      }
    } catch {
      toast.error("Failed to email receipt");
    } finally {
      setEmailingSub(null);
    }
  }

  // Paying-for-others member picker
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");

  function load() {
    fetch("/api/subscriptions?me=true")
      .then((r) => r.json())
      .then((d) => setSubscriptions(d.subscriptions || []))
      .catch(() => toast.error("Failed to load subscriptions"));
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings || {};
        if (s.payment_qr_url) setQrUrl(s.payment_qr_url);
        if (s.payment_upi_id) setUpiId(s.payment_upi_id);
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setMember(d.user);
          // Load saved dues summary from social_links
          const ds = d.user.social_links?.dues_summary;
          if (ds) {
            if (ds.amount_paid != null) setDuesPaid(String(ds.amount_paid));
            if (ds.additional_money != null) setDuesAdditional(String(ds.additional_money));
            if (Array.isArray(ds.proofs)) setDuesProofs(ds.proofs);
            // Migrate old single proof_url
            else if (ds.proof_url) setDuesProofs([{ url: ds.proof_url, date: new Date().toISOString() }]);
          }
          setDuesLoaded(true);
        }
      })
      .catch(() => {});
  }, []);

  const paid = subscriptions.filter((s) => s.status === "paid").length;
  const proofUploaded = subscriptions.filter((s) => (s.status === "pending" || s.status === "overdue") && s.payment_proof_url && s.payment_proof_url !== "").length;
  // "Due" excludes voluntary/flexible funds — those are opt-in contributions, surfaced
  // in their own fund card, not an outstanding due.
  const pending = subscriptions.filter((s) => (s.status === "pending" || s.status === "overdue") && !isFlexibleAmount(s) && (!s.payment_proof_url || s.payment_proof_url === "")).length;
  const totalPaid = subscriptions
    .filter((s) => s.status === "paid")
    .reduce((sum, s) => sum + (s.amount || 0), 0);

  // Voluntary funds (flexible_amount) — group contributions per fund (e.g. Emergency Fund).
  // Members can pay any amount, any number of times, so each fund is a ledger of rows.
  const flexibleFunds = Object.values(
    subscriptions
      .filter((s) => isFlexibleAmount(s))
      .reduce<Record<string, { period: string; contributed: number; paidCount: number; pendingCount: number }>>((acc, s) => {
        const g = acc[s.period] || (acc[s.period] = { period: s.period, contributed: 0, paidCount: 0, pendingCount: 0 });
        if (s.status === "paid") {
          g.contributed += s.paid_amount ?? s.amount ?? 0;
          g.paidCount += 1;
        } else if (s.status !== "rejected") {
          g.pendingCount += 1;
        }
        return acc;
      }, {}),
  );

  // Member's own unpaid fixed dues (non-flexible) — eligible for a combined/split payment
  const pendingDues = subscriptions.filter(
    (s) => !isFlexibleAmount(s) && (s.status === "pending" || s.status === "overdue"),
  );
  const hasFlexFund = subscriptions.some((s) => isFlexibleAmount(s));
  // Show the combine option when there's enough to combine (2+ dues, or 1 due + the fund)
  const canCombine = pendingDues.length >= 2 || (pendingDues.length >= 1 && hasFlexFund);
  const splitDueTotal = pendingDues
    .filter((s) => splitSelected.has(s.id))
    .reduce((sum, s) => sum + (s.amount || 0), 0);
  const splitGrandTotal = splitDueTotal + (parseFloat(splitRefund) || 0);

  // Dues summary calculations
  const duesUpTo2025 = subscriptions
    .filter((s) => /^20(1[0-9]|2[0-5])$/.test(s.period))
    .reduce((sum, s) => sum + (s.amount || 0), 0);
  const dues2026 = subscriptions
    .filter((s) => s.period === "2026")
    .reduce((sum, s) => sum + (s.amount || 0), 0);
  const specialPeriods = [...new Set(subscriptions.filter((s) => !/^\d{4}$/.test(s.period)).map((s) => s.period))];
  const duesUatt = subscriptions
    .filter((s) => !/^\d{4}$/.test(s.period))
    .reduce((sum, s) => sum + (s.amount || 0), 0);
  const duesTotalToPay = duesUpTo2025 + dues2026 + duesUatt;
  const duesPaidNum = Number(duesPaid) || 0;
  const duesAdditionalNum = Number(duesAdditional) || 0;
  const duesPending = duesTotalToPay - duesPaidNum;

  async function handleDuesProofUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10MB"); return; }
    setDuesProofUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      // Use a dummy subscription_id — proof is stored in general bucket
      formData.append("subscription_id", "dues-summary");
      const res = await fetch("/api/upload/payment-proof", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok && data.payment_proof_url) {
        setDuesProofs((prev) => [...prev, { url: data.payment_proof_url, date: new Date().toISOString() }]);
        toast.success("Proof uploaded! Click Save to keep it.");
      } else {
        toast.error(data.error || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setDuesProofUploading(false);
      if (duesFileRef.current) duesFileRef.current.value = "";
    }
  }

  async function saveDuesSummary() {
    if (!member) return;
    setDuesSaving(true);
    try {
      const updatedSocialLinks = {
        ...member.social_links || {},
        dues_summary: {
          amount_paid: duesPaidNum,
          additional_money: duesAdditionalNum,
          proofs: duesProofs,
        },
      };
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: member.name,
          phone: member.phone,
          occupation: member.occupation,
          social_links: updatedSocialLinks,
          posting_details: member.posting_details || {},
        }),
      });
      if (res.ok) {
        toast.success("Due summary saved!");
        setMember({ ...member, social_links: updatedSocialLinks });
      } else {
        const d = await res.json().catch(() => null);
        toast.error(d?.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setDuesSaving(false);
    }
  }

  function triggerUpload(subId: string) {
    setUploadTargetId(subId);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadTargetId) return;

    setUploading(uploadTargetId);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("subscription_id", uploadTargetId);

    try {
      const res = await fetch("/api/upload/payment-proof", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Proof uploaded! Enter your transaction ID below and click Submit to notify admin.", { duration: 6000 });
        setIsNewUpload(true);
        load();
        // Open details dialog for this subscription
        const sub = subscriptions.find((s) => s.id === uploadTargetId);
        if (sub) {
          setDetailsSub({ ...sub, payment_proof_url: data.payment_proof_url });
          // Fetch signed URL for the just-uploaded proof
          fetchSignedPaymentProofUrl(uploadTargetId, data.payment_proof_url)
            .then((url) => setDetailsProofSignedUrl(url))
            .catch(() => {});
          setDetailsForm({
            transaction_id: sub.transaction_id || "",
            payment_method: sub.payment_method || "UPI",
            remarks: sub.remarks || "",
            paying_for_others: false,
            other_members: "",
            amount: sub.amount ? String(sub.amount) : "",
          });

          // Auto-extract transaction ID, payment method, and amount from proof using AI
          if (file) {
            setExtracting(true);
            try {
              const extractFd = new FormData();
              extractFd.append("file", file);
              const extractRes = await fetch("/api/upload/payment-proof/extract-date", { method: "POST", body: extractFd });
              const extractData = await extractRes.json();
              if (extractData.transaction_id || extractData.payment_method || extractData.amount) {
                setDetailsForm((prev) => ({
                  ...prev,
                  transaction_id: extractData.transaction_id || prev.transaction_id,
                  payment_method: extractData.payment_method || prev.payment_method,
                  ...(extractData.amount ? { amount: String(extractData.amount) } : {}),
                }));
                toast.success("Transaction details auto-filled from your proof!");
              } else {
                toast.info("Could not extract details from your receipt. Please fill in the transaction ID, payment method, and amount manually.", { duration: 6000 });
              }
            } catch { /* extraction is best-effort */ }
            setExtracting(false);
          }
        }
      } else {
        toast.error(data.error || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    }
    setUploading(null);
    setUploadTargetId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function fetchPendingMembers(period: string) {
    try {
      const res = await fetch(`/api/subscriptions/pending-members?period=${encodeURIComponent(period)}`);
      const data = await res.json();
      setPendingMembers(data.subscriptions || []);
    } catch {
      setPendingMembers([]);
    }
  }

  function toggleMember(subId: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  }

  // Compute how many other members the amount covers
  const memberSlots = detailsSub && detailsForm.amount && detailsSub.amount
    ? Math.floor(parseFloat(detailsForm.amount) / detailsSub.amount) - 1
    : 0;

  async function handleSaveDetails(e: React.FormEvent | null, submitForReview = false) {
    if (e) e.preventDefault();
    if (!detailsSub) return;
    setDetailsSaving(true);

    // Build remarks: include selected member names and subscription IDs
    let finalRemarks = detailsForm.remarks || "";
    if (detailsForm.paying_for_others && selectedMembers.size > 0) {
      const selectedNames = pendingMembers
        .filter((m) => selectedMembers.has(m.id))
        .map((m) => m.users?.name || m.users?.email || "Unknown")
        .join(", ");
      const selectedIds = Array.from(selectedMembers).join(",");
      finalRemarks = finalRemarks
        ? `${finalRemarks} | Paying on behalf of: ${selectedNames} [sub_ids:${selectedIds}]`
        : `Paying on behalf of: ${selectedNames} [sub_ids:${selectedIds}]`;
    } else if (detailsForm.paying_for_others && detailsForm.other_members.trim()) {
      const names = detailsForm.other_members.trim();
      finalRemarks = finalRemarks ? `${finalRemarks} | Paying on behalf of: ${names}` : `Paying on behalf of: ${names}`;
    }

    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: detailsSub.id,
        transaction_id: detailsForm.transaction_id,
        payment_method: detailsForm.payment_method,
        remarks: finalRemarks,
        ...(detailsForm.amount ? { amount: parseFloat(detailsForm.amount) } : {}),
        ...(submitForReview ? { submit_for_review: true } : {}),
      }),
    });

    if (res.ok) {
      toast.success(submitForReview ? "Submitted for review! Admin will verify your payment." : "Payment details saved.");
      setDetailsSub(null);
      load();
    } else {
      toast.error("Failed to save details");
    }
    setDetailsSaving(false);
  }

  async function viewProof(sub: Subscription) {
    if (!sub.payment_proof_url) return;
    try {
      const url = await fetchSignedPaymentProofUrl(sub.id, sub.payment_proof_url);
      setPreviewUrl(url);
    } catch {
      toast.error("Failed to load proof");
    }
  }

  function openEditDetails(sub: Subscription) {
    setIsNewUpload(false);
    setDetailsSub(sub);
    setDetailsProofSignedUrl(null);
    if (sub.payment_proof_url) {
      fetchSignedPaymentProofUrl(sub.id, sub.payment_proof_url)
        .then((url) => setDetailsProofSignedUrl(url))
        .catch(() => {});
    }
    const remarks = sub.remarks || "";
    const behalfMatch = remarks.match(/\|?\s*Paying on behalf of:\s*(.+)$/i);
    const cleanRemarks = behalfMatch ? remarks.replace(behalfMatch[0], "").trim() : remarks;
    setDetailsForm({
      transaction_id: sub.transaction_id || "",
      payment_method: sub.payment_method || "UPI",
      remarks: cleanRemarks,
      paying_for_others: !!behalfMatch,
      other_members: behalfMatch ? behalfMatch[1].trim() : "",
      amount: sub.amount ? String(sub.amount) : "",
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/15">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
              {member?.avatar_url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={member.avatar_url} alt={member.name} className="w-full h-full object-cover" />
                </>
              ) : (
                <User className="w-6 h-6 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary shrink-0" />
                <h1 className="text-xl font-bold">{t("subs.my_subscriptions")}</h1>
              </div>
              {member ? (
                <>
                  <p className="font-medium text-sm truncate">{member.name || member.email}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                    {member.occupation && <span>{member.occupation}</span>}
                    {member.posting_details?.regular_district && (
                      <span>{member.posting_details.regular_district}{member.posting_details?.block ? `, ${member.posting_details.block}` : ""}</span>
                    )}
                    {member.phone && <span>{member.phone}</span>}
                    {!member.occupation && !member.posting_details?.regular_district && !member.phone && (
                      <span>{member.email}</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-24 h-3 rounded bg-muted animate-pulse" />
                  <div className="w-16 h-3 rounded bg-muted animate-pulse" />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Association Due Summary */}
      {duesLoaded && subscriptions.length > 0 && (
        <Card className="border-primary/15">
          <div className="px-5 py-3">
            <div className="flex items-center gap-2">
              <Calculator size={16} className="text-primary" />
              <span className="font-semibold text-sm">{t("subs.association_dues")}</span>
            </div>
          </div>
          <CardContent className="pt-0 pb-4 px-4">
              <p className="text-[11px] text-muted-foreground mb-3">
                TAMIL NADU HORTICULTURAL OFFICERS WELFARE ASSOCIATION
              </p>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs border-collapse min-w-[750px]">
                  <thead>
                    <tr className="bg-primary/5">
                      <th className="border px-2 py-1.5 text-left font-semibold">Description</th>
                      <th className="border px-2 py-1.5 text-right font-semibold w-28">Amount (₹)</th>
                      <th className="border px-2 py-1.5 text-center font-semibold w-24">Proof</th>
                      <th className="border px-2 py-1.5 text-right font-semibold w-28">Extra (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Annual Subscription (up to 2025)", amount: duesUpTo2025, filter: (s: Subscription) => /^20(1[0-9]|2[0-5])$/.test(s.period) },
                      { label: "Annual Subscription (2026)", amount: dues2026, filter: (s: Subscription) => s.period === "2026" },
                      ...specialPeriods.map((p) => ({
                        label: `Special Fund – ${p.replace(/^For\s+/i, "").replace(/\s+Case\s+(\d{4})$/i, " ($1)")}`,
                        amount: subscriptions.filter((s) => s.period === p).reduce((sum, s) => sum + (s.amount || 0), 0),
                        filter: (s: Subscription) => s.period === p,
                      })),
                    ].map((row) => {
                      const matchingSubs = subscriptions.filter(row.filter);
                      const hasProof = matchingSubs.some((s) => s.payment_proof_url);
                      const subWithProof = matchingSubs.find((s) => s.payment_proof_url);
                      const subForUpload = matchingSubs[0];
                      return (
                        <tr key={row.label}>
                          <td className="border px-2 py-1.5">{row.label}</td>
                          <td className="border px-2 py-1.5 text-right font-mono">{row.amount.toLocaleString("en-IN")}</td>
                          <td className="border px-2 py-1.5 text-center">
                            {row.amount > 0 && subForUpload && (
                              <div className="flex items-center justify-center gap-1">
                                {hasProof ? (
                                  <button
                                    onClick={async () => {
                                      if (subWithProof?.payment_proof_url) {
                                        try {
                                          const url = await fetchSignedPaymentProofUrl(subWithProof.id, subWithProof.payment_proof_url);
                                          setDuesProofPreview(url);
                                        } catch {
                                          toast.error("Failed to load proof");
                                        }
                                      }
                                    }}
                                    className="text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded hover:bg-green-100 flex items-center gap-1"
                                  >
                                    <Eye size={10} /> View
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => { setUploadTargetId(subForUpload.id); fileInputRef.current?.click(); }}
                                    className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100 flex items-center gap-1"
                                  >
                                    <Upload size={10} /> Upload
                                  </button>
                                )}
                              </div>
                            )}
                            {row.amount === 0 && <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="border px-2 py-1.5 text-right font-mono text-muted-foreground">—</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-primary/5 font-semibold">
                      <td className="border px-2 py-1.5">Total Dues</td>
                      <td className="border px-2 py-1.5 text-right font-mono">{duesTotalToPay.toLocaleString("en-IN")}</td>
                      <td className="border px-2 py-1.5"></td>
                      <td className="border px-2 py-1.5 text-right font-mono text-muted-foreground">—</td>
                    </tr>
                    <tr className="bg-green-50">
                      <td className="border px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <Edit2 size={12} className="text-green-600 shrink-0" />
                          <span>Amount Paid (enter your total)</span>
                        </div>
                      </td>
                      <td className="border px-1 py-0.5">
                        <Input
                          type="number"
                          min="0"
                          value={duesPaid}
                          onChange={(e) => setDuesPaid(e.target.value)}
                          className="h-7 text-xs text-right font-mono border-green-300 focus:border-green-500"
                          placeholder="0"
                        />
                      </td>
                      <td className="border px-2 py-1.5"></td>
                      <td className="border px-2 py-1.5 text-right font-mono text-green-600 font-semibold">
                        {duesPaidNum > duesTotalToPay ? `+${(duesPaidNum - duesTotalToPay).toLocaleString("en-IN")}` : "—"}
                      </td>
                    </tr>
                    <tr className={duesPending > 0 ? "bg-red-50" : "bg-green-50"}>
                      <td className="border px-2 py-1.5 font-semibold">Pending Amount</td>
                      <td className={`border px-2 py-1.5 text-right font-mono font-semibold ${duesPending > 0 ? "text-red-600" : "text-green-600"}`}>
                        {duesPending > 0 ? duesPending.toLocaleString("en-IN") : "0"}
                      </td>
                      <td className="border px-2 py-1.5"></td>
                      <td className="border px-2 py-1.5 text-right font-mono text-muted-foreground">—</td>
                    </tr>
                    <tr className="bg-amber-50">
                      <td className="border px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <Edit2 size={12} className="text-amber-600 shrink-0" />
                          <span>Additional Amount Paid</span>
                        </div>
                      </td>
                      <td className="border px-1 py-0.5">
                        <Input
                          type="number"
                          min="0"
                          value={duesAdditional}
                          onChange={(e) => setDuesAdditional(e.target.value)}
                          className="h-7 text-xs text-right font-mono border-amber-300 focus:border-amber-500"
                          placeholder="0"
                        />
                      </td>
                      <td className="border px-2 py-1.5"></td>
                      <td className="border px-2 py-1.5 text-right font-mono text-amber-600 font-semibold">
                        {duesAdditionalNum > 0 ? `+${duesAdditionalNum.toLocaleString("en-IN")}` : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Payment Proof Attachment */}
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <input
                  ref={duesFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleDuesProofUpload}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => duesFileRef.current?.click()}
                  disabled={duesProofUploading}
                >
                  {duesProofUploading ? (
                    <><Upload size={14} className="mr-1.5 animate-pulse" /> Uploading...</>
                  ) : (
                    <><Upload size={14} className="mr-1.5" /> Attach Payment Proof</>
                  )}
                </Button>
                <div className="flex-1" />
                <Button size="sm" onClick={saveDuesSummary} disabled={duesSaving} className="text-xs h-8">
                  {duesSaving ? "Saving..." : <><Save size={14} className="mr-1.5" /> Save</>}
                </Button>
              </div>

              {/* Uploaded proofs list */}
              {duesProofs.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium">Uploaded Proofs ({duesProofs.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {duesProofs.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => setDuesProofPreview(p.url)}
                        className="flex items-center gap-1.5 text-[10px] text-green-700 bg-green-50 px-2 py-1 rounded-lg hover:bg-green-100 transition-colors border border-green-200"
                      >
                        <Eye size={11} />
                        <span>Proof {i + 1}</span>
                        <span className="text-green-500">({new Date(p.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>

          {/* Dues Proof Preview */}
          <PaymentProofPreviewDialog
            open={!!duesProofPreview}
            onOpenChange={(open) => { if (!open) setDuesProofPreview(null); }}
            url={duesProofPreview}
          />
        </Card>
      )}

      {/* QR Code Payment Section */}
      <Card className="border-2 border-primary/20">
        <CardContent className="pt-5">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div
              className={`w-64 h-64 rounded-xl border-2 border-dashed border-primary/30 bg-white flex flex-col items-center justify-center shrink-0 overflow-hidden ${qrUrl ? "cursor-pointer hover:border-primary/60" : ""}`}
              onClick={() => qrUrl && setQrZoom(true)}
            >
              {qrUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrUrl} alt="Payment QR Code" className="w-full h-full object-contain p-1" />
                  <p className="text-[10px] text-primary/60 -mt-5 mb-1">Tap to enlarge</p>
                </>
              ) : (
                <>
                  <QrCode className="w-16 h-16 text-primary/40" />
                  <p className="text-xs text-muted-foreground mt-2 text-center px-2">QR Code will be updated soon</p>
                </>
              )}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-lg font-semibold mb-1">{t("subs.pay_via_upi")}</h2>
              <p className="text-sm text-muted-foreground mb-3">
                {t("subs.scan_qr")}
              </p>
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground"><span className="font-medium text-foreground">Step 1:</span> Scan QR code or transfer to the account</p>
                <p className="text-muted-foreground"><span className="font-medium text-foreground">Step 2:</span> Take a screenshot of the payment confirmation</p>
                <p className="text-muted-foreground"><span className="font-medium text-foreground">Step 3:</span> Upload the screenshot and enter transaction details</p>
                <p className="text-muted-foreground"><span className="font-medium text-foreground">Step 4:</span> Admin will verify and confirm your payment</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label={t("subs.paid")} value={paid} icon={CheckCircle2} borderColor="border-l-green-500" iconColor="text-green-500/40" />
        <MetricCard label="Awaiting Verification" value={proofUploaded} icon={Clock} borderColor="border-l-blue-400" iconColor="text-blue-400/40" />
        <MetricCard label={t("subs.due")} value={pending} icon={Clock} borderColor="border-l-amber-500" iconColor="text-amber-500/40" />
        <MetricCard label={t("subs.total_paid")} value={`₹${totalPaid.toLocaleString("en-IN")}`} icon={IndianRupee} borderColor="border-l-primary" iconColor="text-primary/40" />
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Combine multiple dues + Refundable into one payment */}
      {canCombine && (
        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm">Paid for several dues at once?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Combine your subscription dues{hasFlexFund ? " and a Refundable contribution" : ""} into a single payment with one proof.
                </p>
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={() => setSplitOpen(true)}>
                <Plus size={14} className="mr-1" /> Combine Payment
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Voluntary funds — contribute any amount, any number of times */}
      {flexibleFunds.map((f) => (
        <Card key={`fund-${f.period}`} className="border-2 border-purple-200 bg-purple-50/40">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                <IndianRupee className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">{f.period}</h3>
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 text-[10px]">
                    {t("subs.voluntary")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Contribute any amount, any number of times.
                </p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-sm">
                    Total contributed:{" "}
                    <span className="font-bold text-purple-700">&#8377;{f.contributed.toLocaleString("en-IN")}</span>
                  </span>
                  {f.paidCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {f.paidCount} contribution{f.paidCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  {f.pendingCount > 0 && (
                    <span className="text-xs text-blue-600">{f.pendingCount} awaiting verification</span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs bg-purple-600 hover:bg-purple-700"
                onClick={() => { setContribFund(f.period); setContribAmount(""); }}
              >
                <Plus size={14} className="mr-1" /> Add Contribution
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Subscription List */}
      {subscriptions.length === 0 ? (
        <div className="text-center py-12">
          <Wallet className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">{t("subs.no_subscriptions")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((sub) => {
            const config = getSubStatusConfig(sub.status);
            const Icon = config.icon;
            const isUploading = uploading === sub.id;
            const hasProof = !!sub.payment_proof_url;
            return (
              <Card key={sub.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className={`w-5 h-5 ${sub.status === "paid" ? "text-green-600" : sub.status === "overdue" || sub.status === "rejected" ? "text-red-600" : sub.status === "hold" ? "text-orange-600" : "text-amber-600"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{sub.period}</h3>
                        <Badge variant="outline" className={config.color}>
                          {config.label}
                        </Badge>
                        {isFlexibleAmount(sub) && (
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 text-[10px]">
                            {t("subs.voluntary")}
                          </Badge>
                        )}
                        {hasProof && sub.status !== "paid" && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-[10px]">
                            {t("subs.proof_uploaded")}
                          </Badge>
                        )}
                      </div>
                      {sub.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{sub.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm font-medium">
                          {isFlexibleAmount(sub) && !sub.amount
                            ? "Any amount"
                            : <>&#8377;{sub.amount?.toLocaleString("en-IN") || 0}{isFlexibleAmount(sub) ? " (suggested)" : ""}</>}
                        </span>
                        {sub.paid_amount && sub.paid_amount > (sub.amount || 0) && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">
                            +&#8377;{(sub.paid_amount - (sub.amount || 0)).toLocaleString("en-IN")} extra
                          </Badge>
                        )}
                        {sub.due_date && (
                          <span className="text-xs text-muted-foreground">Due: {formatDate(sub.due_date)}</span>
                        )}
                      </div>
                      {sub.transaction_id && (
                        <p className="text-xs text-muted-foreground mt-0.5">Transaction ID: {sub.transaction_id}</p>
                      )}
                      {sub.payment_method && (
                        <p className="text-xs text-muted-foreground mt-0.5">Payment Method: {sub.payment_method}</p>
                      )}
                      {sub.paid_at && sub.status === "paid" && (
                        <p className="text-xs text-green-600 mt-0.5">
                          Paid on {formatDateTime(sub.paid_at)}
                        </p>
                      )}
                      {hasProof && (
                        <button
                          onClick={() => viewProof(sub)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                        >
                          <ImageIcon size={12} />
                          {t("subs.view_payment_proof")}
                        </button>
                      )}
                      {sub.remarks && (
                        <p className="text-xs text-muted-foreground mt-0.5">Note: {sub.remarks}</p>
                      )}

                      {/* Action buttons — full-width row below content */}
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        {(sub.status === "pending" || sub.status === "overdue") && (
                          <>
                            {!hasProof && upiId && (
                              <a
                                href={`upi://pay?pa=${upiId}&pn=TANHOWA&am=${sub.amount}&cu=INR&tn=TANHOWA+${encodeURIComponent(sub.period)}`}
                                className="inline-flex items-center gap-1 h-8 text-xs px-3 rounded-md border border-green-300 text-green-700 bg-white hover:bg-green-50"
                              >
                                <IndianRupee size={12} />
                                Pay via UPI
                              </a>
                            )}
                            <Button
                              size="sm"
                              className={`h-8 text-xs ${!hasProof ? "bg-primary hover:bg-primary/90" : ""}`}
                              variant={hasProof ? "outline" : "default"}
                              onClick={() => triggerUpload(sub.id)}
                              disabled={isUploading}
                            >
                              {isUploading ? t("subs.uploading") : (
                                <>
                                  <Upload size={12} className="mr-1" />
                                  {hasProof ? t("subs.re_upload") : t("subs.upload_proof")}
                                </>
                              )}
                            </Button>
                            {hasProof && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-primary"
                                onClick={() => openEditDetails(sub)}
                              >
                                <Edit2 size={12} className="mr-1" />
                                {t("subs.edit_details")}
                              </Button>
                            )}
                          </>
                        )}
                        {sub.status === "rejected" && (
                          <Button
                            size="sm"
                            className="h-8 text-xs bg-primary hover:bg-primary/90"
                            onClick={() => triggerUpload(sub.id)}
                            disabled={isUploading}
                          >
                            {isUploading ? t("subs.uploading") : (
                              <>
                                <Upload size={12} className="mr-1" />
                                {t("subs.re_upload")}
                              </>
                            )}
                          </Button>
                        )}
                        {sub.status === "paid" && (
                          <>
                            {hasProof && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => viewProof(sub)}
                              >
                                <Eye size={12} className="mr-1" />
                                {t("subs.view_proof")}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs text-green-700"
                              onClick={() => downloadReceipt(sub)}
                            >
                              <FileDown size={12} className="mr-1" />
                              {t("subs.receipt")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs text-green-700"
                              onClick={() => emailReceipt(sub)}
                              disabled={emailingSub === sub.id}
                            >
                              <Mail size={12} className="mr-1" />
                              {emailingSub === sub.id ? t("subs.sending") : t("subs.email_receipt")}
                            </Button>
                            <span className="ml-auto text-[10px] text-green-600 flex items-center gap-1">
                              <Leaf size={10} />Save a print, Save a Tree.
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PaymentProofPreviewDialog open={!!previewUrl} url={previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)} />

      {/* QR Code Zoom Dialog */}
      <Dialog open={qrZoom} onOpenChange={setQrZoom}>
        <DialogContent showCloseButton={false} className="max-w-sm p-0 gap-0 max-h-[90vh] flex flex-col">
          <div className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-3">
            <DialogTitle className="text-base">Scan to Pay</DialogTitle>
            <DialogClose className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <X size={18} />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {qrUrl && (
              <div className="bg-white rounded-xl p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl} alt="Payment QR Code" className="w-full h-auto" />
              </div>
            )}
            <p className="mt-3 text-center text-xs text-muted-foreground">Open your payment app and scan this QR code</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Details Dialog */}
      <Dialog open={!!detailsSub} onOpenChange={(open) => !open && setDetailsSub(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>
          {detailsSub && (
            <>
              <p className="text-sm text-muted-foreground">
                Fill in or update your payment details for <span className="font-medium text-foreground">{detailsSub.period}</span> (&#8377;{detailsSub.amount?.toLocaleString("en-IN")}).
                Admin will verify based on these details and your uploaded proof.
              </p>
              {detailsSub.payment_proof_url && detailsProofSignedUrl && (
                <div className="space-y-2">
                  <div className="rounded-lg overflow-hidden border max-h-48 overflow-y-auto">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={detailsProofSignedUrl} alt="Proof" className="w-full object-contain" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="flex-1 gap-2" onClick={handleRescan} disabled={extracting || detailsSaving}>
                      <ScanLine size={15} />
                      {extracting ? "Scanning..." : "Re-scan proof"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={handleRemoveProof} disabled={extracting || detailsSaving}>
                      <Trash2 size={15} />
                      Remove
                    </Button>
                  </div>
                </div>
              )}
              <form onSubmit={(e) => handleSaveDetails(e, false)} className="space-y-4">
                <div>
                  <Label>Transaction / Reference ID *</Label>
                  <div className="relative">
                    <Input
                      value={detailsForm.transaction_id}
                      onChange={(e) => setDetailsForm({ ...detailsForm, transaction_id: e.target.value })}
                      placeholder={extracting ? "Extracting from proof..." : "e.g. UPI ref number, bank ref ID"}
                      required
                    />
                    {extracting && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Input
                    value={detailsForm.payment_method}
                    onChange={(e) => setDetailsForm({ ...detailsForm, payment_method: e.target.value })}
                    placeholder="e.g. UPI, Google Pay, Bank Transfer"
                  />
                </div>
                <div>
                  <Label>Amount Paid (&#8377;)</Label>
                  <Input
                    type="number"
                    value={detailsForm.amount}
                    onChange={(e) => setDetailsForm({ ...detailsForm, amount: e.target.value })}
                    placeholder={extracting ? "Extracting from proof..." : "e.g. 3000"}
                  />
                  {detailsSub.amount && detailsForm.amount && parseFloat(detailsForm.amount) !== detailsSub.amount && !isFlexibleAmount(detailsSub) && (
                    <p className="text-xs text-amber-600 mt-1">
                      Subscription amount is &#8377;{detailsSub.amount.toLocaleString("en-IN")} — you entered &#8377;{parseFloat(detailsForm.amount).toLocaleString("en-IN")}
                    </p>
                  )}
                  {isFlexibleAmount(detailsSub) && (
                    <p className="text-xs text-purple-600 mt-1">
                      This is a flexible contribution — you may enter any amount.
                    </p>
                  )}
                </div>
                <div>
                  <Label>Remarks (optional)</Label>
                  <Input
                    value={detailsForm.remarks}
                    onChange={(e) => setDetailsForm({ ...detailsForm, remarks: e.target.value })}
                    placeholder="Any additional notes"
                  />
                </div>

                {/* Paying on behalf of others */}
                <div className="rounded-xl border p-3 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={detailsForm.paying_for_others}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setDetailsForm({ ...detailsForm, paying_for_others: checked, other_members: checked ? detailsForm.other_members : "" });
                        if (checked && detailsSub) {
                          fetchPendingMembers(detailsSub.period);
                        }
                        if (!checked) {
                          setSelectedMembers(new Set());
                          setMemberSearch("");
                        }
                      }}
                      className="rounded"
                    />
                    <Users size={16} className="text-primary" />
                    <span className="text-sm font-medium">I am paying on behalf of other members too</span>
                  </label>

                  {/* Auto-detect bulk payment */}
                  {memberSlots > 0 && !detailsForm.paying_for_others && (
                    <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
                      <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-700">
                        Your payment of <span className="font-semibold">&#8377;{parseFloat(detailsForm.amount).toLocaleString("en-IN")}</span> covers <span className="font-semibold">{memberSlots + 1} members</span> (&#8377;{detailsSub?.amount?.toLocaleString("en-IN")} each). Check the box above to select the other {memberSlots} member{memberSlots > 1 ? "s" : ""}.
                      </p>
                    </div>
                  )}

                  {detailsForm.paying_for_others && (
                    <div className="space-y-3">
                      {memberSlots > 0 && (() => {
                        const matchedAmount = (selectedMembers.size + 1) * (detailsSub?.amount || 0);
                        const totalPaidAmount = parseFloat(detailsForm.amount) || 0;
                        const balance = totalPaidAmount - matchedAmount;
                        return (
                          <div className="space-y-2">
                            <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                              <Users className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                              <p className="text-xs text-green-700">
                                Select members you are paying for ({selectedMembers.size} selected, up to {memberSlots})
                              </p>
                            </div>
                            {selectedMembers.size > 0 && balance > 0 && (
                              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-700">
                                  Matched: <span className="font-semibold">&#8377;{matchedAmount.toLocaleString("en-IN")}</span> ({selectedMembers.size + 1} members) — Balance: <span className="font-semibold">&#8377;{balance.toLocaleString("en-IN")}</span> pending admin approval
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Member picker */}
                      {pendingMembers.length > 0 ? (
                        <div className="space-y-2">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              value={memberSearch}
                              onChange={(e) => setMemberSearch(e.target.value)}
                              placeholder="Search members by name, email, or phone..."
                              className="pl-9"
                            />
                          </div>

                          {/* Selected members chips */}
                          {selectedMembers.size > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {pendingMembers
                                .filter((m) => selectedMembers.has(m.id))
                                .map((m) => (
                                  <Badge key={m.id} variant="secondary" className="gap-1 pr-1">
                                    {m.users?.name || m.users?.email}
                                    <button type="button" onClick={() => toggleMember(m.id)} className="hover:bg-muted rounded-full p-0.5">
                                      <X size={12} />
                                    </button>
                                  </Badge>
                                ))}
                            </div>
                          )}

                          {/* Scrollable member list */}
                          <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
                            {pendingMembers
                              .filter((m) => {
                                if (!memberSearch) return true;
                                const q = memberSearch.toLowerCase();
                                return m.users?.name?.toLowerCase().includes(q) || m.users?.email?.toLowerCase().includes(q) || m.users?.phone?.includes(q);
                              })
                              .map((m) => (
                                <label
                                  key={m.id}
                                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 text-sm ${
                                    selectedMembers.has(m.id) ? "bg-primary/5" : ""
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedMembers.has(m.id)}
                                    onChange={() => toggleMember(m.id)}
                                    className="rounded"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{m.users?.name || "—"}</p>
                                    <p className="text-xs text-muted-foreground truncate">{m.users?.email} {m.users?.phone ? `• ${m.users.phone}` : ""}</p>
                                  </div>
                                  <Badge variant="outline" className="text-[10px] shrink-0">
                                    {m.status}
                                  </Badge>
                                </label>
                              ))}
                            {pendingMembers.filter((m) => {
                              if (!memberSearch) return true;
                              const q = memberSearch.toLowerCase();
                              return m.users?.name?.toLowerCase().includes(q) || m.users?.email?.toLowerCase().includes(q) || m.users?.phone?.includes(q);
                            }).length === 0 && (
                              <p className="text-xs text-muted-foreground text-center py-3">No pending members found</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <Label>Names of other members *</Label>
                          <Input
                            value={detailsForm.other_members}
                            onChange={(e) => setDetailsForm({ ...detailsForm, other_members: e.target.value })}
                            placeholder="e.g., Sivakumar K, Rajesh M, Priya S"
                            required={detailsForm.paying_for_others && selectedMembers.size === 0}
                          />
                        </div>
                      )}

                      <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700">
                          All selected members must be registered on the TANHOWA Portal. Admin will verify and clear their dues upon approval.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {isNewUpload ? (
                    <Button type="button" disabled={detailsSaving} className="w-full bg-primary hover:bg-primary/90" onClick={() => handleSaveDetails(null, true)}>
                      {detailsSaving ? "Submitting..." : "Submit for Review"}
                    </Button>
                  ) : (
                    <>
                      <Button type="submit" variant="outline" className="flex-1" disabled={detailsSaving}>
                        {detailsSaving ? "Saving..." : "Save Details"}
                      </Button>
                      <Button type="button" disabled={detailsSaving} className="flex-1 bg-primary hover:bg-primary/90" onClick={() => handleSaveDetails(null, true)}>
                        {detailsSaving ? "Submitting..." : "Resubmit for Review"}
                      </Button>
                    </>
                  )}
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Combine / split payment dialog */}
      <input ref={splitFileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleSplitProofUpload} />
      <Dialog open={splitOpen} onOpenChange={(open) => { if (!open) setSplitOpen(false); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Combine Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Select the dues this single payment covers{hasFlexFund ? ", and optionally add a Refundable contribution" : ""}. One proof applies to all; admin verifies each.
            </p>

            {/* Pending dues checkboxes */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">My dues</p>
              {pendingDues.length === 0 && <p className="text-xs text-muted-foreground italic">No pending dues.</p>}
              {pendingDues.map((s) => (
                <label key={s.id} className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={splitSelected.has(s.id)}
                    onChange={(e) => {
                      setSplitSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(s.id); else next.delete(s.id);
                        return next;
                      });
                    }}
                    className="accent-primary"
                  />
                  <span className="flex-1 text-sm">{s.period}</span>
                  <span className="text-sm font-mono">&#8377;{(s.amount || 0).toLocaleString("en-IN")}</span>
                </label>
              ))}
            </div>

            {/* Refundable contribution */}
            {hasFlexFund && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Refundable / voluntary contribution (&#8377;)</label>
                <Input type="number" min="0" value={splitRefund} onChange={(e) => setSplitRefund(e.target.value)} placeholder="e.g. 10000" className="mt-1" />
              </div>
            )}

            {/* Total */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-primary/10">
              <span className="text-sm font-medium">Total this payment</span>
              <span className="text-base font-bold text-primary">&#8377;{splitGrandTotal.toLocaleString("en-IN")}</span>
            </div>

            {/* Payment details */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Method</label>
                <select value={splitMethod} onChange={(e) => setSplitMethod(e.target.value)} className="mt-1 w-full h-9 rounded-md border px-2 text-sm">
                  <option>UPI</option><option>Bank Transfer</option><option>Cash</option><option>Cheque</option><option>Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Transaction ID</label>
                <Input value={splitTxn} onChange={(e) => setSplitTxn(e.target.value)} placeholder="UTR / Ref no." className="mt-1 h-9" />
              </div>
            </div>

            {/* Proof */}
            <div>
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => splitFileRef.current?.click()} disabled={splitUploading}>
                {splitUploading ? <><Upload size={14} className="mr-1.5 animate-pulse" /> Uploading...</> : <><Upload size={14} className="mr-1.5" /> {splitProofUrl ? "Replace Proof" : "Attach Payment Proof"}</>}
              </Button>
              {splitProofUrl && <span className="ml-2 text-xs text-green-600">Proof attached ✓</span>}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setSplitOpen(false)} disabled={splitSaving}>Cancel</Button>
              <Button size="sm" onClick={handleSubmitSplit} disabled={splitSaving || splitUploading}>
                {splitSaving ? "Submitting..." : "Submit for Review"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Contribution dialog (voluntary fund) */}
      <Dialog open={!!contribFund} onOpenChange={(open) => { if (!open) { setContribFund(null); setContribAmount(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Contribution</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {contribFund} — contribute any amount. After adding, upload your payment proof on the new entry below and submit it for verification.
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Contribution amount (&#8377;)</label>
              <Input
                type="number"
                min="1"
                value={contribAmount}
                onChange={(e) => setContribAmount(e.target.value)}
                placeholder="e.g. 500"
                className="mt-1"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => { setContribFund(null); setContribAmount(""); }} disabled={contribSaving}>
                Cancel
              </Button>
              <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={handleAddContribution} disabled={contribSaving}>
                {contribSaving ? "Adding..." : "Add Contribution"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
