"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { isFlexibleAmount, displayPeriod } from "@/lib/subscriptions";
import { toast } from "sonner";
import {
  Wallet,
  Search,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  IndianRupee,
  Users,
  Filter,
  ImageIcon,
  Eye,
  QrCode,
  Upload,
  UsersRound,
  Trash2,
  Copy,
  Info,
  BarChart3,
  History,
  Send,
  X,
  ChevronDown,
  FileDown,
  XCircle,
  PauseCircle,
  FileCheck,
} from "lucide-react";
import jsPDF from "jspdf";
import { buildCertifiedRemarks } from "@/lib/payment-verification";
import { formatDate, formatDateTime } from "@/lib/utils";
import { fetchSignedPaymentProofUrl } from "@/lib/subscription-proofs";
import { PaymentProofPreviewDialog } from "@/components/payment-proof-preview-dialog";

interface Subscription {
  id: string;
  user_id: string;
  period: string;
  amount: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  transaction_id: string | null;
  payment_proof_url: string | null;
  remarks: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_amount: number | null;
  payment_group_id: string | null;
  description?: string | null;
  flexible_amount?: boolean | null;
  created_at: string;
  updated_at: string;
  users?: { name: string; email: string; phone: string; posting_details?: { regular_district?: string } };
  approver?: { name: string } | null;
}

interface Stats {
  paid: number; paidAmount: number;
  pending: number; pendingAmount: number;
  overdue: number; overdueAmount: number;
  rejected: number; rejectedAmount: number;
  hold: number; holdAmount: number;
  proofUploaded: number; proofUploadedAmount: number;
  totalCollected: number;
}

interface DistrictRow {
  district: string;
  members: number;
  total: number;
  [period: string]: string | number;
}

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 7 }, (_, i) => String(currentYear - 2 + i));

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<Stats>({ paid: 0, paidAmount: 0, pending: 0, pendingAmount: 0, overdue: 0, overdueAmount: 0, rejected: 0, rejectedAmount: 0, hold: 0, holdAmount: 0, proofUploaded: 0, proofUploadedAmount: 0, totalCollected: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [filterUploadTime, setFilterUploadTime] = useState("all");

  // Bulk create dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ period: String(currentYear), amount: "", due_date: "" });
  const [bulkLoading, setBulkLoading] = useState(false);

  // Verify payment dialog
  const [payDialog, setPayDialog] = useState<Subscription | null>(null);
  const [payForm, setPayForm] = useState({ remarks: "", payment_date: "", payment_time: "", verified_email: "", transaction_id: "", payment_method: "", amount: "" });
  const [payLoading, setPayLoading] = useState(false);
  const [payProofUrl, setPayProofUrl] = useState<string | null>(null);
  const [extractingDate, setExtractingDate] = useState(false);
  const [payeeInfo, setPayeeInfo] = useState<{ paid_to: string | null; paid_account: string | null; is_tanhowa_payment: boolean } | null>(null);
  const [payeeOverride, setPayeeOverride] = useState(false);

  // Admin member picker for bulk payments
  const [adminSelectedMembers, setAdminSelectedMembers] = useState<Set<string>>(new Set());
  const [adminMemberSearch, setAdminMemberSearch] = useState("");
  // Same member, other periods (split payment across years)
  const [adminSelectedPeriods, setAdminSelectedPeriods] = useState<Set<string>>(new Set());

  // Proof preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // QR code
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrUploading, setQrUploading] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);

  // Bulk verify dialog
  const [bulkVerifyOpen, setBulkVerifyOpen] = useState(false);
  const [bulkVerifySelected, setBulkVerifySelected] = useState<Set<string>>(new Set());
  const [bulkVerifyForm, setBulkVerifyForm] = useState({ payment_date: "", payment_time: "", remarks: "" });
  const [bulkVerifyFile, setBulkVerifyFile] = useState<File | null>(null);
  const [bulkVerifyLoading, setBulkVerifyLoading] = useState(false);
  const [bulkVerifySearch, setBulkVerifySearch] = useState("");
  const [bulkExtractingDate, setBulkExtractingDate] = useState(false);

  // District report
  const [districtRows, setDistrictRows] = useState<DistrictRow[]>([]);
  const [districtPeriods, setDistrictPeriods] = useState<string[]>([]);
  const [districtGrandTotal, setDistrictGrandTotal] = useState<DistrictRow | null>(null);
  const [districtLoading, setDistrictLoading] = useState(false);

  // Special subscription dialog
  const [createType, setCreateType] = useState<"yearly" | "special">("yearly");
  const [specialForm, setSpecialForm] = useState({ period: "For UATT 2.0 Case 2025", amount: "3000", due_date: "", description: "", flexible: false });
  const [specialLoading, setSpecialLoading] = useState(false);
  // Target scope: all approved members, or one specific member
  const [createScope, setCreateScope] = useState<"all" | "member">("all");
  const [targetMember, setTargetMember] = useState<{ id: string; name: string } | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<{ id: string; name: string; district: string }[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);

  // Admin proof upload
  const adminFileInputRef = useRef<HTMLInputElement>(null);
  const [adminUploadTargetId, setAdminUploadTargetId] = useState<string | null>(null);
  const [adminUploading, setAdminUploading] = useState<string | null>(null);

  // Page loading
  const [pageLoading, setPageLoading] = useState(true);
  const [adminInfo, setAdminInfo] = useState<{ name: string; designation: string; district: string; isSuperAdmin: boolean; isFinanceTeam: boolean }>({ name: "", designation: "", district: "", isSuperAdmin: false, isFinanceTeam: false });

  // Reject dialog
  const [rejectSub, setRejectSub] = useState<Subscription | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);

  // Notify member dialog
  const [notifySub, setNotifySub] = useState<Subscription | null>(null);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifyLoading, setNotifyLoading] = useState(false);

  function loadDistrictReport() {
    setDistrictLoading(true);
    fetch("/api/subscriptions/district-report")
      .then((r) => r.json())
      .then((d) => {
        setDistrictRows(d.rows || []);
        setDistrictPeriods(d.periods || []);
        setDistrictGrandTotal(d.grandTotal || null);
      })
      .catch(() => {})
      .finally(() => setDistrictLoading(false));
  }

  // Statuses that can be filtered server-side (avoids missing records beyond the page limit)
  const SERVER_FILTERABLE = ["paid", "pending", "overdue", "rejected", "hold", "proof-uploaded", "not-paid"];

  function load(statusFilter?: string) {
    setPageLoading(true);
    const isProofFilter = statusFilter === "proof-uploaded";
    const isNotPaidFilter = statusFilter === "not-paid";
    const apiStatus = statusFilter && !isProofFilter && !isNotPaidFilter && SERVER_FILTERABLE.includes(statusFilter) ? `&status=${statusFilter}` : "";
    const apiProof = isProofFilter ? "&has_proof=true" : "";
    const apiNotPaid = isNotPaidFilter ? "&not_paid=true" : "";
    Promise.all([
      fetch(`/api/subscriptions?limit=2000${apiStatus}${apiProof}${apiNotPaid}`).then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ])
      .then(([subData, settingsData]) => {
        setSubscriptions(subData.subscriptions || []);
        if (subData.stats) setStats(subData.stats);
        const s = settingsData.settings || {};
        if (s.payment_qr_url) setQrUrl(s.payment_qr_url);
      })
      .catch(() => toast.error("Failed to load subscriptions"))
      .finally(() => setPageLoading(false));
  }

  function downloadReceipt(sub: Subscription) {
    const doc = new jsPDF();
    const name = sub.users?.name || "Member";
    const email = sub.users?.email || "";
    const phone = sub.users?.phone || "";
    const district = sub.users?.posting_details?.regular_district || "";
    const approverName = sub.approver?.name || "";
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const paidDate = sub.paid_at ? new Date(sub.paid_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    const approvedDate = sub.approved_at ? new Date(sub.approved_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

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

    // Receipt number & date
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(`Receipt #: ${sub.id.substring(0, 8).toUpperCase()}`, 25, 40);
    doc.text(`Date: ${today}`, 190, 40, { align: "right" });

    doc.setDrawColor(45, 106, 79);
    doc.setLineWidth(0.5);
    doc.line(20, 43, 190, 43);

    // Member details section
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
    if (district) memberRows.push(["District", district]);
    for (const [label, value] of memberRows) {
      if (!value) continue;
      doc.setFont("helvetica", "bold");
      doc.text(label, 25, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, 80, y);
      y += 7;
    }

    // Payment details section
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
    if (approvedDate) payRows.push(["Approved Date", approvedDate]);
    if (approverName) payRows.push(["Approved By", approverName]);

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

    // Certification section
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

      // Word-wrap remarks
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

  async function handleNotify(e: React.FormEvent) {
    e.preventDefault();
    if (!notifySub || !notifyMessage.trim()) return;
    setNotifyLoading(true);
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "notify-member",
        subscription_id: notifySub.id,
        message: notifyMessage.trim(),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(data.message);
      setNotifySub(null);
      setNotifyMessage("");
    } else {
      toast.error(data.error || "Failed to send notification");
    }
    setNotifyLoading(false);
  }

  async function handleQrUpload(file: File) {
    setQrUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload/qr-code", { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok) {
      setQrUrl(data.url);
      toast.success("QR code uploaded successfully");
      setQrDialogOpen(false);
    } else {
      toast.error(data.error || "Upload failed");
    }
    setQrUploading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/users/me").then((r) => r.json()).then((d) => {
      if (d.user) {
        const pd = d.user.posting_details || {};
        const designation = (d.user.occupation || "") + (pd.official_designation ? ` / ${pd.official_designation}` : "");
        const district = pd.regular_district || "";
        const isFinanceTeam = !!d.is_finance_team;
        setAdminInfo({ name: d.user.name || "", designation, district, isSuperAdmin: d.user.role === "super_admin", isFinanceTeam });
        // Default to "DS/DJS Verified" filter for Finance Team members
        if (isFinanceTeam) setFilterStatus("ds-verified");
      }
    }).catch(() => {});
  }, []);

  // Re-fetch when the status filter changes in ways that affect what's loaded server-side
  const prevFilterStatus = useRef(filterStatus);
  useEffect(() => {
    if (prevFilterStatus.current === filterStatus) return;
    const wasServerFiltered = SERVER_FILTERABLE.includes(prevFilterStatus.current);
    prevFilterStatus.current = filterStatus;
    if (SERVER_FILTERABLE.includes(filterStatus)) {
      // Switch to a server-filterable status → fetch that status specifically
      load(filterStatus);
    } else if (wasServerFiltered) {
      // Switch FROM a server-filtered status to a client-side filter (all / not-paid /
      // proof-uploaded / ds-verified) → reload the full unfiltered set so client-side
      // filters have the complete dataset to work with
      load();
    }
    // Switching between two client-side-only filters → existing loaded data is fine
  }, [filterStatus]);

  const periods = useMemo(() => {
    const set = new Set(subscriptions.map((s) => s.period));
    return Array.from(set).sort().reverse();
  }, [subscriptions]);

  const districts = useMemo(() => {
    const set = new Set(subscriptions.map((s) => s.users?.posting_details?.regular_district).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [subscriptions]);

  const filtered = useMemo(() => {
    return subscriptions.filter((sub) => {
      const matchesSearch =
        !searchQuery ||
        sub.users?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.users?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.users?.phone?.includes(searchQuery) ||
        sub.transaction_id?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "not-paid"
          ? sub.status === "pending" || sub.status === "overdue"
          : filterStatus === "proof-uploaded"
            ? !!sub.payment_proof_url && sub.status !== "paid" && sub.status !== "rejected" && sub.status !== "hold"
              && !(sub.remarks && (sub.remarks.startsWith("Verified by") || sub.remarks.startsWith("Provisionally approved.") || sub.remarks.startsWith("Approved.")))
            : filterStatus === "ds-verified"
              ? !!sub.remarks && (sub.remarks.startsWith("Verified by") || sub.remarks.startsWith("Provisionally approved.") || sub.remarks.startsWith("Approved."))
              : sub.status === filterStatus);
      const matchesPeriod = filterPeriod === "all" || sub.period === filterPeriod;
      const matchesDistrict = filterDistrict === "all" || sub.users?.posting_details?.regular_district === filterDistrict;
      let matchesUploadTime = true;
      if (filterUploadTime !== "all" && sub.payment_proof_url) {
        const now = Date.now();
        const cutoff = filterUploadTime === "1h" ? now - 3600000
          : filterUploadTime === "3h" ? now - 3 * 3600000
          : filterUploadTime === "6h" ? now - 6 * 3600000
          : filterUploadTime === "12h" ? now - 12 * 3600000
          : filterUploadTime === "24h" ? now - 24 * 3600000
          : filterUploadTime === "today" ? new Date().setHours(0, 0, 0, 0)
          : filterUploadTime === "7d" ? now - 7 * 86400000
          : 0;
        matchesUploadTime = new Date(sub.updated_at).getTime() >= cutoff;
      } else if (filterUploadTime !== "all" && !sub.payment_proof_url) {
        matchesUploadTime = false;
      }
      return matchesSearch && matchesStatus && matchesPeriod && matchesDistrict && matchesUploadTime;
    });
  }, [subscriptions, searchQuery, filterStatus, filterPeriod, filterDistrict, filterUploadTime]);

  // Member picker (per-member create) — search ALL approved members server-side,
  // not just those whose subscription rows are on the current page.
  useEffect(() => {
    const q = memberSearch.trim();
    if (createScope !== "member" || targetMember || q.length < 2) { setMemberResults([]); return; }
    setMemberSearching(true);
    const tmr = setTimeout(async () => {
      try {
        const res = await fetch(`/api/subscriptions?member_search=${encodeURIComponent(q)}`);
        const data = await res.json();
        setMemberResults(res.ok ? (data.members || []) : []);
      } catch { setMemberResults([]); }
      setMemberSearching(false);
    }, 300);
    return () => clearTimeout(tmr);
  }, [memberSearch, createScope, targetMember]);

  async function handleBulkCreate(e: React.FormEvent) {
    e.preventDefault();
    if (createScope === "member" && !targetMember) { toast.error("Pick a member first"); return; }
    setBulkLoading(true);
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: createScope === "member" ? "member-create" : "bulk-create",
        user_id: targetMember?.id,
        period: bulkForm.period,
        amount: parseFloat(bulkForm.amount) || 0,
        due_date: bulkForm.due_date || null,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(createScope === "member" ? `Created ${bulkForm.period} subscription for ${targetMember?.name}` : `Created ${data.count} subscription entries for ${bulkForm.period}`);
      setBulkOpen(false);
      setBulkForm({ period: String(currentYear), amount: "", due_date: "" });
      resetCreateScope();
      load();
    } else {
      toast.error(data.error || "Failed");
    }
    setBulkLoading(false);
  }

  function resetCreateScope() {
    setCreateScope("all");
    setTargetMember(null);
    setMemberSearch("");
  }

  async function handleSpecialCreate(e: React.FormEvent) {
    e.preventDefault();
    if (createScope === "member" && !targetMember) { toast.error("Pick a member first"); return; }
    setSpecialLoading(true);
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: createScope === "member" ? "member-create" : "bulk-create",
        user_id: targetMember?.id,
        period: specialForm.period,
        amount: specialForm.flexible ? (parseFloat(specialForm.amount) || 0) : (parseFloat(specialForm.amount) || 3000),
        due_date: specialForm.due_date || null,
        description: specialForm.description,
        flexible: specialForm.flexible,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(createScope === "member" ? `Created "${specialForm.period}" for ${targetMember?.name}` : `Created ${data.count} special subscription entries`);
      setBulkOpen(false);
      setSpecialForm({ period: "For UATT 2.0 Case 2025", amount: "3000", due_date: "", description: "", flexible: false });
      resetCreateScope();
      load();
    } else {
      toast.error(data.error || "Failed");
    }
    setSpecialLoading(false);
  }

  async function handleVerifyPaid(e: React.FormEvent) {
    e.preventDefault();
    if (!payDialog) return;
    if (payeeInfo?.is_tanhowa_payment === false && !payeeOverride) {
      toast.error("Approval blocked — use the override checkbox to approve anyway.");
      return;
    }
    setPayLoading(true);

    // Build paid_at from admin-entered date & time
    let paidAt: string | undefined;
    if (payForm.payment_date) {
      const time = payForm.payment_time || "12:00";
      paidAt = new Date(`${payForm.payment_date}T${time}:00`).toISOString();
    }

    // Generate a payment_group_id if there are linked members or split periods
    const hasLinked = adminSelectedMembers.size > 0 || adminSelectedPeriods.size > 0;
    const groupId = hasLinked ? crypto.randomUUID() : undefined;

    let remarkBase = payForm.remarks;
    if (payeeOverride && payeeInfo?.is_tanhowa_payment === false) {
      const overrideNote = `[OVERRIDE] Payee mismatch overridden — paid to: ${payeeInfo.paid_to || "unknown"}, account: ${payeeInfo.paid_account || "unknown"}`;
      remarkBase = remarkBase ? `${remarkBase}. ${overrideNote}` : overrideNote;
    }
    const certifiedRemarks = buildCertifiedRemarks(remarkBase);

    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: payDialog.id,
        status: "paid",
        remarks: certifiedRemarks,
        paid_at: paidAt,
        transaction_id: payForm.transaction_id || payDialog.transaction_id,
        payment_method: payForm.payment_method || payDialog.payment_method,
        ...(payForm.amount ? { paid_amount: parseFloat(payForm.amount) } : {}),
        ...(groupId ? { payment_group_id: groupId } : {}),
      }),
    });
    if (res.ok) {
      let extraCount = 0;
      const failedIds: string[] = [];

      // Also verify same member's other periods (split payment across years)
      if (adminSelectedPeriods.size > 0) {
        for (const subId of adminSelectedPeriods) {
          try {
            const periodRes = await fetch("/api/subscriptions", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: subId,
                status: "paid",
                paid_at: paidAt,
                payment_proof_url: payDialog.payment_proof_url,
                transaction_id: payForm.transaction_id || payDialog.transaction_id,
                payment_method: payForm.payment_method || payDialog.payment_method,
                remarks: `Split payment — same proof as ${payDialog.period}`,
                ...(groupId ? { payment_group_id: groupId } : {}),
              }),
            });
            if (periodRes.ok) extraCount++; else failedIds.push(subId);
          } catch { failedIds.push(subId); }
        }
      }

      // Also verify admin-selected linked members (other members, same period)
      if (adminSelectedMembers.size > 0) {
        for (const subId of adminSelectedMembers) {
          try {
            const linkedRes = await fetch("/api/subscriptions", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: subId,
                status: "paid",
                paid_at: paidAt,
                payment_proof_url: payDialog.payment_proof_url,
                transaction_id: payForm.transaction_id || payDialog.transaction_id,
                payment_method: payForm.payment_method || payDialog.payment_method,
                remarks: `Bulk payment by ${payDialog.users?.name || payDialog.users?.email}`,
                ...(payDialog.amount ? { amount: payDialog.amount } : {}),
                ...(groupId ? { payment_group_id: groupId } : {}),
              }),
            });
            if (linkedRes.ok) extraCount++; else failedIds.push(subId);
          } catch { failedIds.push(subId); }
        }
      }

      // Auto-approve matching subscriptions (same txn ID, proof URL, or DS/DJS remark)
      const remarksSig = payDialog.remarks?.match(/^(?:Provisionally )?[Aa]pproved\.\s*(.+?)\.\s*\(/)?.[1] || null;
      const autoMatches = subscriptions.filter(
        (s) => s.id !== payDialog.id && s.status !== "paid" && s.period === payDialog.period &&
          !adminSelectedMembers.has(s.id) && !adminSelectedPeriods.has(s.id) && (
            (payDialog.transaction_id && s.transaction_id === payDialog.transaction_id) ||
            (payDialog.payment_proof_url && s.payment_proof_url === payDialog.payment_proof_url) ||
            (remarksSig && s.remarks?.includes(remarksSig))
          )
      );
      if (autoMatches.length > 0) {
        const autoGroupId = groupId || crypto.randomUUID();
        // Also tag the primary with the group if not already
        if (!groupId) {
          await fetch("/api/subscriptions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: payDialog.id, payment_group_id: autoGroupId }),
          }).catch(() => {});
        }
        for (const s of autoMatches) {
          try {
            const r = await fetch("/api/subscriptions", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: s.id,
                status: "paid",
                paid_at: paidAt || new Date().toISOString(),
                transaction_id: payForm.transaction_id || payDialog.transaction_id || s.transaction_id,
                payment_method: payForm.payment_method || payDialog.payment_method || s.payment_method,
                remarks: certifiedRemarks,
                payment_group_id: autoGroupId,
              }),
            });
            if (r.ok) extraCount++; else failedIds.push(s.id);
          } catch { failedIds.push(s.id); }
        }
      }

      if (failedIds.length > 0) {
        toast.warning(`Payment verified. ${extraCount} additional approved, ${failedIds.length} failed.`);
      } else if (extraCount > 0) {
        toast.success(`Payment verified + ${extraCount} additional subscription${extraCount > 1 ? "s" : ""}`);
      } else {
        toast.success("Payment verified and marked as paid");
      }
      setPayDialog(null);
      setPayForm({ remarks: "", payment_date: "", payment_time: "", verified_email: "", transaction_id: "", payment_method: "", amount: "" });
      setAdminSelectedMembers(new Set());
      setAdminMemberSearch("");
      setAdminSelectedPeriods(new Set());
      setPayeeInfo(null);
      load();
    } else {
      toast.error("Failed to update");
    }
    setPayLoading(false);
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

  async function handleHold(id: string) {
    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "hold" }),
    });
    if (res.ok) {
      toast.success("Payment put on hold");
      load();
    } else {
      toast.error("Failed to put on hold");
    }
  }

  async function handleMarkOverdue(id: string) {
    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "overdue" }),
    });
    if (res.ok) {
      toast.success("Marked as overdue");
      load();
    }
  }

  async function handleRevert(id: string) {
    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "pending" }),
    });
    if (res.ok) {
      toast.success("Reverted to pending");
      load();
    }
  }

  async function handleReject(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectSub) return;
    setRejectLoading(true);
    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rejectSub.id, status: "rejected", remarks: rejectRemarks.trim() || "Payment rejected by admin" }),
    });
    if (res.ok) {
      toast.success("Payment rejected");
      setRejectSub(null);
      setRejectRemarks("");
      load();
    } else {
      toast.error("Failed to reject");
    }
    setRejectLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this subscription entry? This cannot be undone.")) return;
    const res = await fetch(`/api/subscriptions?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Subscription deleted");
      load();
    } else {
      toast.error("Failed to delete");
    }
  }

  async function handleAdminFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !adminUploadTargetId) return;
    setAdminUploading(adminUploadTargetId);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("subscription_id", adminUploadTargetId);
    try {
      const res = await fetch("/api/upload/payment-proof", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        toast.success("Payment proof uploaded! Extracting details...");
        load();
        // If verify dialog is open for this subscription, refresh the proof image
        if (payDialog?.id === adminUploadTargetId) {
          try {
            const signedUrl = await fetchSignedPaymentProofUrl(adminUploadTargetId, data.payment_proof_url);
            setPayProofUrl(signedUrl);
            setPayDialog((prev) => prev ? { ...prev, payment_proof_url: data.payment_proof_url } : prev);
          } catch {
            toast.error("Failed to refresh uploaded proof");
          }
        }
        // Always run OCR extraction
        setExtractingDate(true);
        setPayeeInfo(null);
        try {
          const fd = new FormData();
          fd.append("file", file);
          const extRes = await fetch("/api/upload/payment-proof/extract-date", { method: "POST", body: fd });
          const extData = await extRes.json();
          if (extData.date || extData.time || extData.transaction_id || extData.payment_method || extData.amount) {
            setPayForm((prev) => ({
              ...prev,
              ...(extData.date ? { payment_date: extData.date } : {}),
              ...(extData.time ? { payment_time: extData.time } : {}),
              ...(extData.transaction_id ? { transaction_id: extData.transaction_id } : {}),
              ...(extData.payment_method ? { payment_method: extData.payment_method } : {}),
              ...(extData.amount ? { amount: String(extData.amount) } : {}),
            }));
            toast.success("Transaction details extracted from proof!");
          }
          if (extData.paid_to || extData.paid_account) {
            setPayeeInfo({ paid_to: extData.paid_to, paid_account: extData.paid_account, is_tanhowa_payment: extData.is_tanhowa_payment });
            if (!extData.is_tanhowa_payment) {
              toast.error("Warning: Payment may NOT be to TANHOWA account!", { duration: 8000 });
            }
          } else {
            setPayeeInfo(null);
          }
        } catch { /* best-effort */ }
        setExtractingDate(false);
      } else {
        toast.error(data.error || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    }
    setAdminUploading(null);
    setAdminUploadTargetId(null);
    if (adminFileInputRef.current) adminFileInputRef.current.value = "";
  }

  // Pending/overdue subscriptions for bulk verify member list
  const pendingForBulk = useMemo(() => {
    return subscriptions
      .filter((s) => s.status === "pending" || s.status === "overdue")
      .filter((s) => {
        if (!bulkVerifySearch) return true;
        const q = bulkVerifySearch.toLowerCase();
        return s.users?.name?.toLowerCase().includes(q) || s.users?.email?.toLowerCase().includes(q) || s.users?.phone?.includes(q);
      });
  }, [subscriptions, bulkVerifySearch]);

  function toggleBulkSelect(id: string) {
    setBulkVerifySelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkVerify(e: React.FormEvent) {
    e.preventDefault();
    if (bulkVerifySelected.size === 0) {
      toast.error("Select at least one member");
      return;
    }
    setBulkVerifyLoading(true);

    try {
      const time = bulkVerifyForm.payment_time || "12:00";
      const paidAt = bulkVerifyForm.payment_date
        ? new Date(`${bulkVerifyForm.payment_date}T${time}:00`).toISOString()
        : new Date().toISOString();

      const formData = new FormData();
      if (bulkVerifyFile) formData.append("file", bulkVerifyFile);
      formData.append("subscription_ids", JSON.stringify(Array.from(bulkVerifySelected)));
      formData.append("paid_at", paidAt);
      formData.append("remarks", bulkVerifyForm.remarks);

      const res = await fetch("/api/subscriptions/bulk-verify", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setBulkVerifyOpen(false);
        setBulkVerifySelected(new Set());
        setBulkVerifyFile(null);
        setBulkVerifyForm({ payment_date: "", payment_time: "", remarks: "" });
        load();
      } else {
        toast.error(data.error || "Bulk verify failed");
      }
    } catch {
      toast.error("Request failed — please try again");
    } finally {
      setBulkVerifyLoading(false);
    }
  }

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading subscriptions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Subscriptions</h1>
            <p className="text-sm text-muted-foreground">Manage yearly member subscription payments</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => {
              const today = new Date();
              setBulkVerifyForm({ payment_date: today.toISOString().split("T")[0], payment_time: today.toTimeString().slice(0, 5), remarks: "" });
              setBulkVerifySelected(new Set());
              setBulkVerifyFile(null);
              setBulkVerifySearch("");
              setBulkVerifyOpen(true);
            }}
          >
            <UsersRound size={16} className="mr-1" />
            Bulk Verify
          </Button>
          <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <QrCode size={16} className="mr-1" />
                {qrUrl ? "Update QR" : "Upload QR"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Payment QR Code</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">Upload the UPI/bank payment QR code image. Members will see this on their subscriptions page.</p>
              {qrUrl && (
                <div className="rounded-xl overflow-hidden border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrUrl} alt="Current QR code" className="w-full max-w-[250px] mx-auto" />
                  <p className="text-xs text-center text-muted-foreground py-2">Current QR code</p>
                </div>
              )}
              <div className="space-y-3">
                <Label>Select QR Code Image</Label>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={qrUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleQrUpload(file);
                  }}
                />
                {qrUploading && <p className="text-sm text-muted-foreground">Uploading...</p>}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90">
                <Plus size={16} className="mr-1" />
                New Subscription
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Subscription</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCreateType("yearly")}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${createType === "yearly" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted"}`}
                >
                  Yearly
                </button>
                <button
                  type="button"
                  onClick={() => setCreateType("special")}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${createType === "special" ? "border-accent bg-accent/10 text-accent" : "border-input text-muted-foreground hover:bg-muted"}`}
                >
                  Special
                </button>
              </div>

              {/* Scope: all approved members, or one specific member */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setCreateScope("all"); setTargetMember(null); }}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${createScope === "all" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted"}`}
                >
                  All members
                </button>
                <button
                  type="button"
                  onClick={() => setCreateScope("member")}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${createScope === "member" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted"}`}
                >
                  Specific member
                </button>
              </div>
              {createScope === "member" && (
                <div className="space-y-2">
                  {targetMember ? (
                    <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                      <span className="text-sm font-medium">{targetMember.name}</span>
                      <button type="button" onClick={() => setTargetMember(null)} className="text-xs text-red-600 hover:underline">Change</button>
                    </div>
                  ) : (
                    <>
                      <Input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search member by name…" />
                      {memberSearch.trim().length >= 2 && (
                        <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
                          {memberSearching ? (
                            <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
                          ) : memberResults.length > 0 ? (
                            memberResults.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => { setTargetMember({ id: m.id, name: m.name }); setMemberSearch(""); }}
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                              >
                                <span>{m.name}</span>
                                <span className="text-xs text-muted-foreground">{m.district}</span>
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-2 text-xs text-muted-foreground">No member found.</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {createType === "yearly" ? (
                <>
                  <p className="text-sm text-muted-foreground">{createScope === "member" ? `This creates a pending subscription entry for ${targetMember?.name || "the selected member"} for the chosen year.` : "This creates a pending subscription entry for every approved member for the selected year."}</p>
                  <form onSubmit={handleBulkCreate} className="space-y-4">
                    <div>
                      <Label>Year *</Label>
                      <Select value={bulkForm.period} onValueChange={(val) => setBulkForm({ ...bulkForm, period: val })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {yearOptions.map((y) => (
                            <SelectItem key={y} value={y}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Amount (&#8377;) *</Label>
                      <Input
                        type="number"
                        value={bulkForm.amount}
                        onChange={(e) => setBulkForm({ ...bulkForm, amount: e.target.value })}
                        placeholder="500"
                        required
                      />
                    </div>
                    <div>
                      <Label>Due Date</Label>
                      <Input
                        type="date"
                        value={bulkForm.due_date}
                        onChange={(e) => setBulkForm({ ...bulkForm, due_date: e.target.value })}
                      />
                    </div>
                    <Button type="submit" disabled={bulkLoading || (createScope === "member" && !targetMember)} className="w-full bg-primary hover:bg-primary/90">
                      {bulkLoading ? "Creating..." : createScope === "member" ? `Create for ${targetMember?.name || "Member"}` : "Create for All Members"}
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{createScope === "member" ? `This creates a pending special subscription entry for ${targetMember?.name || "the selected member"}. Use for a legal case fund, a member-specific levy, etc.` : "This creates a pending special subscription entry for every approved member. Use for legal case funds, one-time levies, etc."}</p>
                  <form onSubmit={handleSpecialCreate} className="space-y-4">
                    <div>
                      <Label>Label *</Label>
                      <Input
                        value={specialForm.period}
                        onChange={(e) => setSpecialForm({ ...specialForm, period: e.target.value })}
                        placeholder="e.g. For UATT 2.0 Case 2025"
                        required
                      />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea
                        value={specialForm.description}
                        onChange={(e) => setSpecialForm({ ...specialForm, description: e.target.value })}
                        placeholder="What is this contribution for? Shown to members on their subscription card."
                        rows={2}
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-accent"
                        checked={specialForm.flexible}
                        onChange={(e) => setSpecialForm({ ...specialForm, flexible: e.target.checked })}
                      />
                      <span className="text-sm">Flexible amount — let members enter any amount they wish to pay</span>
                    </label>
                    <div>
                      <Label>{specialForm.flexible ? <>Suggested amount (&#8377;) &mdash; optional</> : <>Amount (&#8377;) *</>}</Label>
                      <Input
                        type="number"
                        value={specialForm.amount}
                        onChange={(e) => setSpecialForm({ ...specialForm, amount: e.target.value })}
                        placeholder={specialForm.flexible ? "Leave blank for no suggested amount" : "3000"}
                        required={!specialForm.flexible}
                      />
                      {specialForm.flexible && (
                        <p className="text-xs text-purple-600 mt-1">Members can pay any amount; the suggested value is shown only as a hint.</p>
                      )}
                    </div>
                    <div>
                      <Label>Due Date</Label>
                      <Input
                        type="date"
                        value={specialForm.due_date}
                        onChange={(e) => setSpecialForm({ ...specialForm, due_date: e.target.value })}
                      />
                    </div>
                    <Button type="submit" disabled={specialLoading || (createScope === "member" && !targetMember)} className="w-full bg-accent hover:bg-accent/90 text-white">
                      {specialLoading ? "Creating..." : createScope === "member" ? `Create for ${targetMember?.name || "Member"}` : "Create for All Members"}
                    </Button>
                  </form>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Hidden file input for admin proof upload */}
      <input
        type="file"
        ref={adminFileInputRef}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleAdminFileChange}
        className="hidden"
      />

      <Tabs defaultValue="members" onValueChange={(val) => { if (val === "district-report" && districtRows.length === 0) loadDistrictReport(); }}>
        <TabsList>
          <TabsTrigger value="members">Member Payments</TabsTrigger>
          <TabsTrigger value="district-report" className="gap-1.5"><BarChart3 size={14} /> District Report</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-6 mt-4">

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          { label: "Paid", value: stats.paid, subAmount: stats.paidAmount, color: "text-green-600", iconColor: "text-green-500", Icon: CheckCircle2, filter: "paid", badge: undefined },
          { label: "Proof Uploaded", value: stats.proofUploaded, subAmount: stats.proofUploadedAmount, color: "text-blue-600", iconColor: "text-blue-400", Icon: FileCheck, filter: "proof-uploaded", badge: "View all →" },
          { label: "Pending", value: stats.pending, subAmount: stats.pendingAmount, color: "text-amber-600", iconColor: "text-amber-500", Icon: Clock, filter: "pending", badge: undefined },
          { label: "Overdue", value: stats.overdue, subAmount: stats.overdueAmount, color: "text-red-600", iconColor: "text-red-500", Icon: AlertTriangle, filter: "overdue", badge: undefined },
          { label: "On Hold", value: stats.hold, subAmount: stats.holdAmount, color: "text-purple-600", iconColor: "text-purple-400", Icon: PauseCircle, filter: "hold", badge: undefined },
          { label: "Rejected", value: stats.rejected, subAmount: stats.rejectedAmount, color: "text-rose-700", iconColor: "text-rose-400", Icon: XCircle, filter: "rejected", badge: undefined },
          { label: "Collected", value: null, subAmount: undefined, amount: stats.totalCollected, color: "text-foreground", iconColor: "text-primary", Icon: IndianRupee, filter: null, badge: undefined },
        ].map(({ label, value, subAmount, amount, color, iconColor, Icon, filter, badge }) => (
          <Card
            key={label}
            className={filter ? "cursor-pointer hover:border-primary/40 transition-colors" : ""}
            onClick={() => {
              if (!filter) return;
              const next = filterStatus === filter ? "all" : filter;
              setFilterStatus(next);
              setFilterPeriod("all");
              setFilterDistrict("all");
              setFilterUploadTime("all");
              setSearchQuery("");
            }}
          >
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</p>
                  <p className={`text-lg sm:text-xl font-bold ${color}`}>
                    {amount !== undefined ? `₹${amount.toLocaleString("en-IN")}` : value}
                  </p>
                  {subAmount !== undefined && subAmount > 0 && (
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">₹{subAmount.toLocaleString("en-IN")}</p>
                  )}
                  {badge && <p className="text-[10px] text-blue-500 font-medium mt-0.5">{badge}</p>}
                </div>
                <Icon className={`w-5 h-5 sm:w-6 sm:h-6 shrink-0 opacity-40 ${iconColor}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search & Filter */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone, or transaction ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0 hidden sm:block" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="not-paid">Unpaid</SelectItem>
                  <SelectItem value="proof-uploaded">Proof Uploaded</SelectItem>
                  <SelectItem value="ds-verified">DS/DJS Verified</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger className="w-[calc(50%-4px)] sm:w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {periods.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterDistrict} onValueChange={setFilterDistrict}>
                <SelectTrigger className="w-[calc(50%-4px)] sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Districts</SelectItem>
                  {districts.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterUploadTime} onValueChange={setFilterUploadTime}>
                <SelectTrigger className="w-[calc(50%-4px)] sm:w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Upload Times</SelectItem>
                  <SelectItem value="1h">Uploaded in 1 Hour</SelectItem>
                  <SelectItem value="3h">Uploaded in 3 Hours</SelectItem>
                  <SelectItem value="6h">Uploaded in 6 Hours</SelectItem>
                  <SelectItem value="12h">Uploaded in 12 Hours</SelectItem>
                  <SelectItem value="24h">Uploaded in 24 Hours</SelectItem>
                  <SelectItem value="today">Uploaded Today</SelectItem>
                  <SelectItem value="7d">Uploaded in 7 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Result count */}
      {subscriptions.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {filtered.length} subscription{filtered.length !== 1 ? "s" : ""}{filtered.length < subscriptions.length ? ` (${subscriptions.length} loaded)` : ""}
          {filtered.length !== subscriptions.length && (
            <button className="ml-2 text-primary hover:underline" onClick={() => { setFilterStatus("all"); setFilterPeriod("all"); setFilterDistrict("all"); setFilterUploadTime("all"); setSearchQuery(""); }}>
              Clear filters
            </button>
          )}
        </p>
      )}

      {/* Subscription List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">
            {subscriptions.length === 0
              ? "No subscriptions yet. Create a yearly subscription to get started."
              : "No subscriptions match your filters"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((sub) => {
            const hasProof = !!sub.payment_proof_url;
            return (
              <Card key={sub.id} className={sub.status === "paid" ? "opacity-75" : hasProof && sub.status !== "paid" ? "border-blue-200 bg-blue-50/30" : ""}>
                <CardContent className="pt-4">
                  <div>
                    <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-sm truncate uppercase">{sub.users?.name || "Unknown"}</h3>
                        <button
                          className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                          title="Copy name"
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(sub.users?.name || ""); toast.success("Copied"); }}
                        >
                          <Copy size={12} />
                        </button>
                        <Badge
                          variant="outline"
                          className={
                            sub.status === "paid"
                              ? "bg-green-100 text-green-700 border-green-300"
                              : sub.status === "overdue"
                                ? "bg-red-100 text-red-700 border-red-300"
                                : sub.status === "rejected"
                                  ? "bg-red-100 text-red-700 border-red-300"
                                  : sub.status === "hold"
                                    ? "bg-orange-100 text-orange-700 border-orange-300"
                                    : "bg-amber-100 text-amber-700 border-amber-300"
                          }
                        >
                          {sub.status === "hold" ? "On Hold" : sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                        </Badge>
                        {hasProof && sub.status !== "paid" && (
                          <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300 text-[10px]">
                            Proof Uploaded
                          </Badge>
                        )}
                        {(sub.remarks?.startsWith("Verified by") || sub.remarks?.startsWith("Provisionally approved.") || sub.remarks?.startsWith("Approved.")) && sub.status !== "paid" && (
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 text-[10px]">
                            DS/DJS Verified
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{sub.users?.email} {sub.users?.phone && `| ${sub.users.phone}`}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">{displayPeriod(sub.period)}</Badge>
                        {isFlexibleAmount(sub) && (
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 text-[10px]">Flexible</Badge>
                        )}
                        {sub.description && (
                          <p className="basis-full text-xs text-muted-foreground">{sub.description}</p>
                        )}
                        <span className="text-sm font-semibold">
                          {isFlexibleAmount(sub) && !sub.amount ? "Any amount" : <>&#8377;{sub.amount?.toLocaleString("en-IN") || 0}</>}
                        </span>
                        {sub.paid_amount && sub.paid_amount > (sub.amount || 0) && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">
                            +&#8377;{(sub.paid_amount - (sub.amount || 0)).toLocaleString("en-IN")} extra
                          </Badge>
                        )}
                        {sub.due_date && <span className="text-xs text-muted-foreground">Due: {formatDate(sub.due_date)}</span>}
                        {sub.paid_at && sub.status === "paid" && <span className="text-xs text-green-600">Paid: {formatDateTime(sub.paid_at)}</span>}
                      </div>
                      {sub.transaction_id && (
                        <p className="text-xs text-muted-foreground mt-1">Txn ID: <span className="font-mono">{sub.transaction_id}</span></p>
                      )}
                      {sub.payment_method && (
                        <p className="text-xs text-muted-foreground">Method: {sub.payment_method}</p>
                      )}
                      {sub.remarks && <p className="text-xs text-muted-foreground">Note: {sub.remarks}</p>}
                      {/* Payment Timeline */}
                      <div className="flex flex-wrap items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                        <span className="bg-muted px-1.5 py-0.5 rounded">Created {formatDate(sub.created_at)}</span>
                        {hasProof && <><span>&rarr;</span><span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Proof Uploaded</span></>}
                        {(sub.remarks?.startsWith("Verified by") || sub.remarks?.startsWith("Provisionally approved.") || sub.remarks?.startsWith("Approved.")) && <><span>&rarr;</span><span className="bg-green-50 text-green-600 px-1.5 py-0.5 rounded">{sub.remarks.split(" on ")[0]}</span></>}
                        {sub.approved_at && (
                          <><span>&rarr;</span><span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                            Approved {formatDate(sub.approved_at)}{sub.approver?.name ? ` by ${sub.approver.name}` : ""}
                          </span></>
                        )}
                        {sub.status === "rejected" && <><span>&rarr;</span><span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded">Rejected</span></>}
                        {sub.status === "hold" && <><span>&rarr;</span><span className="bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">On Hold</span></>}
                      </div>
                      {sub.payment_group_id && (() => {
                        const grouped = subscriptions.filter(
                          (s) => s.payment_group_id === sub.payment_group_id && s.id !== sub.id
                        );
                        if (grouped.length === 0) return null;
                        return (
                          <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-2">
                            <p className="text-xs font-medium text-blue-700 mb-1">
                              Linked Payment ({grouped.length + 1} total)
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {grouped.map((g) => (
                                <span key={g.id} className="inline-flex items-center gap-1 text-[11px] bg-white border border-blue-200 rounded px-1.5 py-0.5">
                                  <span className="font-medium">{g.users?.name || "Unknown"}</span>
                                  <span className="text-muted-foreground">{g.period}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    </div>
                    {/* Action buttons — full-width row */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      {hasProof && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => viewProof(sub)}
                        >
                          <Eye size={12} className="mr-1" />
                          View Proof
                        </Button>
                      )}
                      {(sub.status === "pending" || sub.status === "overdue") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={adminUploading === sub.id}
                          onClick={() => {
                            setAdminUploadTargetId(sub.id);
                            adminFileInputRef.current?.click();
                          }}
                        >
                          {adminUploading === sub.id ? (
                            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-1" />
                          ) : (
                            <Upload size={12} className="mr-1" />
                          )}
                          {hasProof ? "Re-upload" : "Upload Proof"}
                        </Button>
                      )}
                      {(sub.status === "pending" || sub.status === "overdue") && (
                        <>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                            onClick={async () => {
                              setPayDialog(sub);
                              const today = new Date();
                              let defaultRemark = "";
                              // Finance Team members: remarks auto-appended by server, keep textarea empty
                              // Other admins: pre-fill with existing remark or generate provisional/approved remark
                              if (!adminInfo.isFinanceTeam) {
                                defaultRemark = sub.remarks || "";
                                if (!defaultRemark && adminInfo.name) {
                                  const parts = [adminInfo.name];
                                  if (adminInfo.designation) parts.push(adminInfo.designation);
                                  if (!adminInfo.isSuperAdmin && adminInfo.district) parts.push(adminInfo.district);
                                  parts.push("TANHOWA");
                                  defaultRemark = adminInfo.isSuperAdmin
                                    ? `Approved. - ${parts.join(", ")}.`
                                    : `Provisionally approved. - ${parts.join(", ")}.`;
                                }
                              }
                              setPayForm({
                                remarks: defaultRemark,
                                payment_date: today.toISOString().split("T")[0],
                                payment_time: today.toTimeString().slice(0, 5),
                                verified_email: sub.users?.email || "",
                                transaction_id: sub.transaction_id || "",
                                payment_method: sub.payment_method || "",
                                amount: sub.amount ? String(sub.amount) : "",
                              });
                              setPayProofUrl(null);
                              setExtractingDate(false);
                              setPayeeInfo(null);
                              setAdminSelectedMembers(new Set());
                              setAdminMemberSearch("");
                              if (sub.payment_proof_url) {
                                try {
                                  const signedUrl = await fetchSignedPaymentProofUrl(sub.id, sub.payment_proof_url);
                                  setPayProofUrl(signedUrl);
                                  // Extract date/time from proof image using AI
                                  setExtractingDate(true);
                                  setPayeeInfo(null);
                                  try {
                                    const fd = new FormData();
                                    fd.append("image_url", signedUrl);
                                    const extRes = await fetch("/api/upload/payment-proof/extract-date", { method: "POST", body: fd });
                                    const extData = await extRes.json();
                                    if (extData.date || extData.time || extData.transaction_id || extData.payment_method || extData.amount) {
                                      setPayForm((prev) => ({
                                        ...prev,
                                        ...(extData.date ? { payment_date: extData.date } : {}),
                                        ...(extData.time ? { payment_time: extData.time } : {}),
                                        ...(extData.transaction_id && !prev.transaction_id ? { transaction_id: extData.transaction_id } : {}),
                                        ...(extData.payment_method && !prev.payment_method ? { payment_method: extData.payment_method } : {}),
                                        ...(extData.amount ? { amount: String(extData.amount) } : {}),
                                      }));
                                      setPayDialog((prev) => prev ? {
                                        ...prev,
                                        ...(extData.transaction_id && !prev.transaction_id ? { transaction_id: extData.transaction_id } : {}),
                                        ...(extData.payment_method && !prev.payment_method ? { payment_method: extData.payment_method } : {}),
                                      } : prev);
                                    }
                                    if (extData.paid_to || extData.paid_account) {
                                      setPayeeInfo({ paid_to: extData.paid_to, paid_account: extData.paid_account, is_tanhowa_payment: extData.is_tanhowa_payment });
                                      if (!extData.is_tanhowa_payment) {
                                        toast.error("Warning: Payment may NOT be to TANHOWA account!", { duration: 8000 });
                                      }
                                    } else {
                                      setPayeeInfo(null);
                                    }
                                  } catch { toast.error("Could not extract payment details — please enter manually"); }
                                  setExtractingDate(false);
                                } catch {
                                  toast.error("Failed to load proof");
                                }
                              }
                            }}
                          >
                            Verify & Approve
                          </Button>
                          {(sub.status === "pending" || sub.status === "overdue") && (
                            <>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs"
                                onClick={() => handleMarkOverdue(sub.id)}
                              >
                                Mark Overdue
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-orange-700 border-orange-300 hover:bg-orange-50"
                                onClick={() => handleHold(sub.id)}
                              >
                                Hold
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-red-700 border-red-300 hover:bg-red-50"
                                onClick={() => { setRejectSub(sub); setRejectRemarks(""); }}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </>
                      )}
                      {(sub.status === "overdue" || sub.status === "hold" || sub.status === "rejected") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleRevert(sub.id)}
                        >
                          Revert to Pending
                        </Button>
                      )}
                      {sub.status === "paid" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
                            onClick={() => downloadReceipt(sub)}
                          >
                            <FileDown size={12} className="mr-1" />
                            Receipt
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleRevert(sub.id)}
                          >
                            Revert
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          setNotifySub(sub);
                          setNotifyMessage(
                            sub.status === "pending" || sub.status === "overdue"
                              ? `Your subscription payment for ${sub.period} (₹${sub.amount?.toLocaleString("en-IN") || 0}) is still ${sub.status}. Please make the payment and upload the proof in the TANHOWA portal at your earliest convenience.`
                              : ""
                          );
                        }}
                      >
                        <Send size={12} className="mr-1" />
                        Notify
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(sub.id)}
                      >
                        <Trash2 size={12} className="mr-1" />
                        Delete
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

        <TabsContent value="district-report" className="space-y-4 mt-4">
          {districtLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Loading district report...</span>
            </div>
          ) : districtRows.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No paid subscription data to show</p>
            </div>
          ) : (
            <>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground mb-1">District-wise subscription collection report computed from verified payments.</p>
                  <Button variant="outline" size="sm" onClick={loadDistrictReport}>Refresh</Button>
                </CardContent>
              </Card>
              <div className="rounded-xl border overflow-auto -mx-4 sm:mx-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-3 sm:px-4 py-3 font-semibold text-xs sm:text-sm sticky left-0 bg-muted/50 z-10">S.No</th>
                      <th className="text-left px-3 sm:px-4 py-3 font-semibold text-xs sm:text-sm sticky left-10 bg-muted/50 z-10">District</th>
                      <th className="text-center px-3 sm:px-4 py-3 font-semibold text-xs sm:text-sm">Members</th>
                      {districtPeriods.map((p) => (
                        <th key={p} className="text-right px-3 sm:px-4 py-3 font-semibold text-xs sm:text-sm whitespace-nowrap">
                          {/^\d{4}$/.test(p) ? p : (
                            <span title={p} className="cursor-help flex flex-col items-end gap-0.5">
                              <span>Special Fund</span>
                              <span className="text-[10px] font-normal text-muted-foreground border-b border-dashed border-muted-foreground">
                                {p.replace(/^For\s+/i, "").replace(/\s+Case\s+(\d{4})$/i, " $1")}
                              </span>
                            </span>
                          )}
                        </th>
                      ))}
                      <th className="text-right px-3 sm:px-4 py-3 font-semibold text-xs sm:text-sm">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {districtRows.map((row, i) => (
                      <tr key={row.district} className="hover:bg-muted/30">
                        <td className="px-3 sm:px-4 py-2.5 text-xs sm:text-sm text-muted-foreground sticky left-0 bg-white z-10">{i + 1}</td>
                        <td className="px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium sticky left-10 bg-white z-10 whitespace-nowrap">{row.district}</td>
                        <td className="px-3 sm:px-4 py-2.5 text-xs sm:text-sm text-center">{row.members}</td>
                        {districtPeriods.map((p) => (
                          <td key={p} className="px-3 sm:px-4 py-2.5 text-xs sm:text-sm text-right font-mono whitespace-nowrap">
                            {(row[p] as number) > 0 ? `₹${(row[p] as number).toLocaleString("en-IN")}` : "—"}
                          </td>
                        ))}
                        <td className="px-3 sm:px-4 py-2.5 text-xs sm:text-sm text-right font-semibold font-mono whitespace-nowrap">
                          {(row.total as number) > 0 ? `₹${(row.total as number).toLocaleString("en-IN")}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {districtGrandTotal && (
                    <tfoot>
                      <tr className="bg-primary/5 font-bold border-t-2">
                        <td className="px-3 sm:px-4 py-3 text-xs sm:text-sm sticky left-0 bg-primary/5 z-10" />
                        <td className="px-3 sm:px-4 py-3 text-xs sm:text-sm sticky left-10 bg-primary/5 z-10">TOTAL</td>
                        <td className="px-3 sm:px-4 py-3 text-xs sm:text-sm text-center">{districtGrandTotal.members}</td>
                        {districtPeriods.map((p) => (
                          <td key={p} className="px-3 sm:px-4 py-3 text-xs sm:text-sm text-right font-mono whitespace-nowrap">
                            ₹{((districtGrandTotal[p] as number) || 0).toLocaleString("en-IN")}
                          </td>
                        ))}
                        <td className="px-3 sm:px-4 py-3 text-xs sm:text-sm text-right font-mono whitespace-nowrap">
                          ₹{((districtGrandTotal.total as number) || 0).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Verify Payment Dialog */}
      <Dialog open={!!payDialog} onOpenChange={(open) => { if (!open) { setPayDialog(null); setPayeeInfo(null); setPayeeOverride(false); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Verify & Approve Payment</DialogTitle>
          </DialogHeader>
          {payDialog && (
            <div className="space-y-4">
              {/* Member + Payment Summary */}
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{payDialog.users?.name || "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground">{payDialog.users?.email} {payDialog.users?.phone && `| ${payDialog.users.phone}`}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold">&#8377;{payDialog.amount?.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-muted-foreground">{payDialog.period}</p>
                  </div>
                </div>
                {(payDialog.transaction_id || payDialog.payment_method || payDialog.remarks) && (
                  <div className="mt-3 pt-3 border-t text-xs space-y-1">
                    {payDialog.transaction_id && <p><span className="text-muted-foreground">Txn ID:</span> <span className="font-mono font-medium">{payDialog.transaction_id}</span></p>}
                    {payDialog.payment_method && <p><span className="text-muted-foreground">Method:</span> {payDialog.payment_method}</p>}
                    {payDialog.remarks && <p><span className="text-muted-foreground">Note:</span> {payDialog.remarks}</p>}
                  </div>
                )}
              </div>

              {/* Same payment — bulk approval (match by txn ID, proof URL, or DS/DJS approval remark) */}
              {(() => {
                // Extract DS/DJS approver signature from remarks (e.g., "Provisionally approved. Mr. X, TANHOWA. (03 Apr 2026)")
                const remarksSig = payDialog.remarks?.match(/^(?:Provisionally )?[Aa]pproved\.\s*(.+?)\.\s*\(/)?.[1] || null;

                const sameTxn = subscriptions.filter(
                  (s) => s.id !== payDialog.id && s.status !== "paid" && s.period === payDialog.period && (
                    (payDialog.transaction_id && s.transaction_id === payDialog.transaction_id) ||
                    (payDialog.payment_proof_url && s.payment_proof_url === payDialog.payment_proof_url) ||
                    (remarksSig && s.remarks?.includes(remarksSig))
                  )
                );
                if (sameTxn.length === 0) return null;
                const totalAmount = (payDialog.amount || 0) + sameTxn.reduce((sum, s) => sum + (s.amount || 0), 0);
                return (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
                    <p className="text-xs font-semibold text-blue-800">
                      Same payment found on {sameTxn.length} other subscription{sameTxn.length > 1 ? "s" : ""} (Total: &#8377;{totalAmount.toLocaleString("en-IN")})
                    </p>
                    <div className="space-y-1">
                      {sameTxn.map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-xs">
                          <span className="font-medium">{s.users?.name || s.users?.email}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{displayPeriod(s.period)}</span>
                            <span>&#8377;{(s.amount || 0).toLocaleString("en-IN")}</span>
                            <Badge variant="outline" className="text-[10px] h-5 capitalize">{s.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full bg-green-600 hover:bg-green-700 text-xs"
                      disabled={payLoading}
                      onClick={async () => {
                        if (!confirm(`Approve all ${sameTxn.length + 1} subscriptions with this transaction ID?`)) return;
                        setPayLoading(true);
                        try {
                          let paidAt: string | undefined;
                          if (payForm.payment_date) {
                            const time = payForm.payment_time || "12:00";
                            paidAt = new Date(`${payForm.payment_date}T${time}:00`).toISOString();
                          }
                          const groupId = crypto.randomUUID();
                          const allIds = [payDialog.id, ...sameTxn.map((s) => s.id)];
                          let success = 0;
                          for (const subId of allIds) {
                            const res = await fetch("/api/subscriptions", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                id: subId,
                                status: "paid",
                                paid_at: paidAt || new Date().toISOString(),
                                transaction_id: payDialog.transaction_id,
                                payment_method: payForm.payment_method || payDialog.payment_method,
                                remarks: payForm.remarks || "",
                                payment_group_id: groupId,
                              }),
                            });
                            if (res.ok) success++;
                          }
                          toast.success(`Approved ${success} of ${allIds.length} subscriptions`);
                          setPayDialog(null);
                          setPayeeInfo(null);
                          setPayeeOverride(false);
                          load();
                        } catch {
                          toast.error("Failed to approve");
                        }
                        setPayLoading(false);
                      }}
                    >
                      <CheckCircle2 size={14} className="mr-1" />
                      Approve All {sameTxn.length + 1} Members
                    </Button>
                  </div>
                );
              })()}

              {/* Payment Proof Image */}
              {payDialog.payment_proof_url && payProofUrl && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Payment Proof Image</h3>
                  <div className="rounded-xl overflow-hidden border bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={payProofUrl} alt="Payment proof" className="w-full" />
                  </div>
                </div>
              )}
              {payDialog.payment_proof_url && !payProofUrl && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading proof image...</span>
                </div>
              )}
              {!payDialog.payment_proof_url && (
                <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-700 font-medium">No payment proof uploaded by member</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100"
                    disabled={adminUploading === payDialog.id}
                    onClick={() => {
                      setAdminUploadTargetId(payDialog.id);
                      adminFileInputRef.current?.click();
                    }}
                  >
                    {adminUploading === payDialog.id ? (
                      <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-1" />
                    ) : (
                      <Upload size={12} className="mr-1" />
                    )}
                    Upload Proof
                  </Button>
                </div>
              )}

              {/* Verification Form */}
              <form onSubmit={handleVerifyPaid} className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Transaction ID</Label>
                    <Input
                      value={payForm.transaction_id}
                      onChange={(e) => setPayForm({ ...payForm, transaction_id: e.target.value })}
                      placeholder="UPI ref / UTR"
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Payment Method</Label>
                    <Input
                      value={payForm.payment_method}
                      onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })}
                      placeholder="e.g. IMPS, UPI"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Amount (&#8377;)</Label>
                    <Input
                      type="number"
                      value={payForm.amount}
                      onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                      placeholder={payDialog.amount?.toString()}
                    />
                  </div>
                </div>

                {/* Same member, other periods (split payment across years) */}
                {payDialog && (() => {
                  const sameMemberOtherPeriods = subscriptions.filter(
                    (s) => s.user_id === payDialog.user_id && s.id !== payDialog.id && (s.status === "pending" || s.status === "overdue")
                  );
                  if (sameMemberOtherPeriods.length === 0) return null;
                  return (
                    <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-purple-600" />
                        <p className="text-xs font-semibold text-purple-800">
                          Also verify other periods for {payDialog.users?.name || "this member"}
                          {adminSelectedPeriods.size > 0 && ` (${adminSelectedPeriods.size} selected)`}
                        </p>
                      </div>
                      <div className="space-y-1">
                        {sameMemberOtherPeriods.map((s) => (
                          <label
                            key={s.id}
                            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer hover:bg-purple-100/50 text-xs ${
                              adminSelectedPeriods.has(s.id) ? "bg-purple-100" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={adminSelectedPeriods.has(s.id)}
                              onChange={() => {
                                setAdminSelectedPeriods((prev) => {
                                  const n = new Set(prev);
                                  if (n.has(s.id)) n.delete(s.id); else n.add(s.id);
                                  return n;
                                });
                              }}
                              className="rounded"
                            />
                            <div className="flex-1 flex items-center justify-between">
                              <span className="font-semibold">{displayPeriod(s.period)}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">&#8377;{(s.amount || 0).toLocaleString("en-IN")}</span>
                                <Badge variant="outline" className="text-[10px] h-5 capitalize">{s.status}</Badge>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                      {adminSelectedPeriods.size > 0 && (
                        <p className="text-[10px] text-purple-700">
                          Total: &#8377;{(
                            (payDialog.amount || 0) +
                            sameMemberOtherPeriods
                              .filter((s) => adminSelectedPeriods.has(s.id))
                              .reduce((sum, s) => sum + (s.amount || 0), 0)
                          ).toLocaleString("en-IN")} ({adminSelectedPeriods.size + 1} periods)
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Admin member picker for bulk payments — always available */}
                {payDialog && (() => {
                  const samePeriodPending = subscriptions.filter(
                    (s) => s.period === payDialog.period && s.user_id !== payDialog.user_id && (s.status === "pending" || s.status === "overdue")
                  );
                  const hasAmountHint = payForm.amount && payDialog.amount && parseFloat(payForm.amount) > payDialog.amount;
                  const slots = hasAmountHint ? Math.floor(parseFloat(payForm.amount) / payDialog.amount) - 1 : 0;
                  const isExpanded = adminSelectedMembers.size > 0 || adminMemberSearch.length > 0 || (hasAmountHint && slots > 0);
                  return (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-2">
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full text-left"
                        onClick={() => {
                          if (!isExpanded) setAdminMemberSearch(" ");
                          else { setAdminMemberSearch(""); setAdminSelectedMembers(new Set()); }
                        }}
                      >
                        <Users className="w-4 h-4 text-blue-600" />
                        <p className="text-xs font-semibold text-blue-800 flex-1">
                          Link other members to this payment
                          {adminSelectedMembers.size > 0 && ` (${adminSelectedMembers.size} selected)`}
                          {hasAmountHint && slots > 0 && ` — amount covers up to ${slots + 1} members`}
                        </p>
                        <ChevronDown className={`w-4 h-4 text-blue-600 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                      {isExpanded && (
                        <>
                          {hasAmountHint && slots > 0 && adminSelectedMembers.size === 0 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="w-full text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                              onClick={() => {
                                const toSelect = samePeriodPending.slice(0, slots).map((s) => s.id);
                                setAdminSelectedMembers(new Set(toSelect));
                              }}
                            >
                              Select first {Math.min(slots, samePeriodPending.length)} members (amount covers {slots + 1} total)
                            </Button>
                          )}
                          {adminSelectedMembers.size > 0 && payForm.amount && payDialog.amount && (() => {
                            const matchedAmt = (adminSelectedMembers.size + 1) * payDialog!.amount;
                            const totalAmt = parseFloat(payForm.amount) || 0;
                            const bal = totalAmt - matchedAmt;
                            if (bal <= 0) return null;
                            return (
                              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-amber-700">
                                  Matched: <span className="font-semibold">&#8377;{matchedAmt.toLocaleString("en-IN")}</span> ({adminSelectedMembers.size + 1} members) — Balance: <span className="font-semibold">&#8377;{bal.toLocaleString("en-IN")}</span> pending
                                </p>
                              </div>
                            );
                          })()}
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                              value={adminMemberSearch.trim()}
                              onChange={(e) => setAdminMemberSearch(e.target.value)}
                              placeholder="Search by name, email, phone..."
                              className="pl-8 h-8 text-xs"
                            />
                          </div>
                          {adminSelectedMembers.size > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {samePeriodPending
                                .filter((s) => adminSelectedMembers.has(s.id))
                                .map((s) => (
                                  <Badge key={s.id} variant="secondary" className="gap-1 pr-1 text-[10px]">
                                    {s.users?.name || s.users?.email}
                                    <button type="button" onClick={() => {
                                      setAdminSelectedMembers((prev) => { const n = new Set(prev); n.delete(s.id); return n; });
                                    }} className="hover:bg-muted rounded-full p-0.5">
                                      <X size={10} />
                                    </button>
                                  </Badge>
                                ))}
                            </div>
                          )}
                          <div className="max-h-32 overflow-y-auto border rounded-lg divide-y bg-white">
                            {samePeriodPending
                              .filter((s) => {
                                if (!adminMemberSearch.trim()) return true;
                                const q = adminMemberSearch.trim().toLowerCase();
                                return s.users?.name?.toLowerCase().includes(q) || s.users?.email?.toLowerCase().includes(q) || s.users?.phone?.includes(q);
                              })
                              .map((s) => (
                                <label
                                  key={s.id}
                                  className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-muted/50 text-xs ${
                                    adminSelectedMembers.has(s.id) ? "bg-primary/5" : ""
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={adminSelectedMembers.has(s.id)}
                                    onChange={() => {
                                      setAdminSelectedMembers((prev) => {
                                        const n = new Set(prev);
                                        if (n.has(s.id)) n.delete(s.id); else n.add(s.id);
                                        return n;
                                      });
                                    }}
                                    className="rounded"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium">{s.users?.name || "—"}</span>
                                    <span className="text-muted-foreground ml-1.5">{s.users?.email}</span>
                                  </div>
                                </label>
                              ))}
                            {samePeriodPending.filter((s) => {
                              if (!adminMemberSearch.trim()) return true;
                              const q = adminMemberSearch.trim().toLowerCase();
                              return s.users?.name?.toLowerCase().includes(q) || s.users?.email?.toLowerCase().includes(q) || s.users?.phone?.includes(q);
                            }).length === 0 && (
                              <p className="text-[10px] text-muted-foreground text-center py-2">No pending members for {payDialog.period}</p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                <div className="space-y-2">
                  {extractingDate && (
                    <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600" />
                      Extracting payment details from proof image...
                    </div>
                  )}
                  {payeeInfo && (
                    <div className={`rounded-lg px-3 py-2 text-xs ${payeeInfo.is_tanhowa_payment ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-300"}`}>
                      <p className={`font-semibold ${payeeInfo.is_tanhowa_payment ? "text-green-800" : "text-red-800"}`}>
                        {payeeInfo.is_tanhowa_payment ? "TANHOWA Account Payment" : "WARNING: Person-to-Person Payment"}
                      </p>
                      {payeeInfo.paid_to && <p className={payeeInfo.is_tanhowa_payment ? "text-green-700" : "text-red-700"}>Paid to: {payeeInfo.paid_to}</p>}
                      {payeeInfo.paid_account && <p className={payeeInfo.is_tanhowa_payment ? "text-green-700" : "text-red-700"}>Account: {payeeInfo.paid_account}</p>}
                      {!payeeInfo.is_tanhowa_payment && (
                        <>
                          <p className="text-red-700 font-medium mt-1">This payment appears to be a person-to-person transaction, not to TANHOWA.</p>
                          <label className="flex items-center gap-2 mt-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={payeeOverride}
                              onChange={(e) => setPayeeOverride(e.target.checked)}
                              className="rounded border-red-400 text-red-600 focus:ring-red-500"
                            />
                            <span className="text-red-800 font-semibold text-[11px]">Override &amp; approve anyway (I have verified this payment manually)</span>
                          </label>
                        </>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Payment Date (from proof) *</Label>
                      <Input
                        type="date"
                        value={payForm.payment_date}
                        onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label>Payment Time (from proof)</Label>
                      <Input
                        type="time"
                        value={payForm.payment_time}
                        onChange={(e) => setPayForm({ ...payForm, payment_time: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Admin Remarks (optional)</Label>
                  <Textarea
                    value={payForm.remarks}
                    onChange={(e) => setPayForm({ ...payForm, remarks: e.target.value })}
                    placeholder="Any notes about the verification"
                    rows={2}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={payLoading || (payeeInfo?.is_tanhowa_payment === false && !payeeOverride)}
                  className="w-full bg-green-600 hover:bg-green-700 h-11 text-base"
                >
                  {payLoading ? "Verifying..." : "Confirm Payment Received"}
                </Button>
                {payeeInfo?.is_tanhowa_payment === false && !payeeOverride && (
                  <p className="text-xs text-red-500 text-center">Payee mismatch - check the override box above to approve anyway.</p>
                )}
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PaymentProofPreviewDialog open={!!previewUrl} url={previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)} />

      {/* Bulk Verify Dialog */}
      <Dialog open={bulkVerifyOpen} onOpenChange={setBulkVerifyOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Verify Payments</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Upload one proof image and link it to multiple members. All selected members will be marked as paid.</p>
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Only registered members with pending/overdue subscriptions appear below. If a member is not listed, they need to register on the TANHOWA Portal first.
            </p>
          </div>
          <form onSubmit={handleBulkVerify} className="space-y-4">
            {/* Search & Select Members */}
            <div className="space-y-2">
              <Label>Select Members *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or phone..."
                  value={bulkVerifySearch}
                  onChange={(e) => setBulkVerifySearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="border rounded-xl max-h-[200px] overflow-y-auto divide-y">
                {pendingForBulk.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No pending/overdue members found</p>
                ) : (
                  pendingForBulk.map((sub) => (
                    <label
                      key={sub.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={bulkVerifySelected.has(sub.id)}
                        onChange={() => toggleBulkSelect(sub.id)}
                        className="rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <p className="text-sm font-medium truncate uppercase">{sub.users?.name || "Unknown"}</p>
                          <button
                            className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                            title="Copy name"
                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(sub.users?.name || ""); toast.success("Copied"); }}
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{sub.users?.email} {sub.users?.phone && `| ${sub.users.phone}`}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant="secondary" className="text-[10px]">{displayPeriod(sub.period)}</Badge>
                        {isFlexibleAmount(sub) && (
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 text-[10px] ml-1">Flexible</Badge>
                        )}
                        <p className="text-xs font-semibold">{isFlexibleAmount(sub) && !sub.amount ? "Any amount" : <>&#8377;{sub.amount?.toLocaleString("en-IN")}</>}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
              {bulkVerifySelected.size > 0 && (
                <p className="text-xs text-primary font-medium">{bulkVerifySelected.size} member(s) selected</p>
              )}
            </div>

            {/* Proof Image Upload */}
            <div className="space-y-2">
              <Label>Payment Proof Image</Label>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0] || null;
                  setBulkVerifyFile(file);
                  if (file) {
                    setBulkExtractingDate(true);
                    try {
                      const fd = new FormData();
                      fd.append("file", file);
                      const res = await fetch("/api/upload/payment-proof/extract-date", { method: "POST", body: fd });
                      const data = await res.json();
                      if (data.date || data.time) {
                        setBulkVerifyForm((prev) => ({
                          ...prev,
                          ...(data.date ? { payment_date: data.date } : {}),
                          ...(data.time ? { payment_time: data.time } : {}),
                        }));
                      }
                    } catch {}
                    setBulkExtractingDate(false);
                  }
                }}
              />
              {bulkVerifyFile && (
                <p className="text-xs text-muted-foreground">{bulkVerifyFile.name} ({(bulkVerifyFile.size / 1024).toFixed(0)} KB)</p>
              )}
            </div>

            {/* Payment Date & Time */}
            {bulkExtractingDate && (
              <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600" />
                Extracting payment date & time from proof image...
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment Date (from proof) *</Label>
                <Input
                  type="date"
                  value={bulkVerifyForm.payment_date}
                  onChange={(e) => setBulkVerifyForm({ ...bulkVerifyForm, payment_date: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Payment Time (from proof)</Label>
                <Input
                  type="time"
                  value={bulkVerifyForm.payment_time}
                  onChange={(e) => setBulkVerifyForm({ ...bulkVerifyForm, payment_time: e.target.value })}
                />
              </div>
            </div>

            {/* Remarks */}
            <div>
              <Label>Remarks (optional)</Label>
              <Textarea
                value={bulkVerifyForm.remarks}
                onChange={(e) => setBulkVerifyForm({ ...bulkVerifyForm, remarks: e.target.value })}
                placeholder="e.g., Bulk collection at district meeting"
                rows={2}
              />
            </div>

            <Button
              type="submit"
              disabled={bulkVerifyLoading || bulkVerifySelected.size === 0}
              className="w-full bg-green-600 hover:bg-green-700 h-11 text-base"
            >
              {bulkVerifyLoading ? "Verifying..." : `Verify ${bulkVerifySelected.size} Member(s) as Paid`}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reject Payment Dialog */}
      <Dialog open={!!rejectSub} onOpenChange={(open) => !open && setRejectSub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment</DialogTitle>
          </DialogHeader>
          {rejectSub && (
            <form onSubmit={handleReject} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Reject payment from <span className="font-medium text-foreground">{rejectSub.users?.name}</span> for {rejectSub.period} (&#8377;{rejectSub.amount?.toLocaleString("en-IN")}).
              </p>
              <div className="space-y-2">
                <Label>Reason / Remarks *</Label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "The payment was done during May 2025 not during December 2025 or after. It may be a 2025 subscription.",
                    "The payment does not have the member details.",
                    "The proof doesn't have much information, upload a detailed one.",
                    "The payment is person to person transaction, not a transaction to TANHOWA.",
                    "The payment is for multiple members, some of the members are not registered with our site.",
                  ].map((reason, i) => (
                    <button
                      key={i}
                      type="button"
                      className="text-xs text-left px-2 py-1 rounded-md border border-muted-foreground/20 hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors"
                      onClick={() => setRejectRemarks(rejectRemarks ? `${rejectRemarks}\n${reason}` : reason)}
                    >
                      {i + 1}. {reason.length > 60 ? reason.substring(0, 60) + "..." : reason}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={rejectRemarks}
                  onChange={(e) => setRejectRemarks(e.target.value)}
                  placeholder="Select a reason above or type custom remarks..."
                  rows={3}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setRejectSub(null)}>Cancel</Button>
                <Button type="submit" variant="destructive" disabled={rejectLoading || !rejectRemarks.trim()}>
                  {rejectLoading ? "Rejecting..." : "Reject Payment"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Notify Member Dialog */}
      <Dialog open={!!notifySub} onOpenChange={(open) => !open && setNotifySub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Notification</DialogTitle>
          </DialogHeader>
          {notifySub && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                <p className="font-medium uppercase">{notifySub.users?.name || "Unknown"}</p>
                <p className="text-xs text-muted-foreground">{notifySub.users?.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">{notifySub.period}</Badge>
                  <span className="text-sm font-semibold">&#8377;{notifySub.amount?.toLocaleString("en-IN") || 0}</span>
                  <Badge
                    variant="outline"
                    className={
                      notifySub.status === "paid"
                        ? "bg-green-100 text-green-700 border-green-300"
                        : notifySub.status === "overdue"
                          ? "bg-red-100 text-red-700 border-red-300"
                          : "bg-amber-100 text-amber-700 border-amber-300"
                    }
                  >
                    {notifySub.status.charAt(0).toUpperCase() + notifySub.status.slice(1)}
                  </Badge>
                </div>
              </div>
              <form onSubmit={handleNotify} className="space-y-3">
                <div>
                  <Label>Message *</Label>
                  <Textarea
                    value={notifyMessage}
                    onChange={(e) => setNotifyMessage(e.target.value)}
                    placeholder="Enter the message to send to this member..."
                    rows={4}
                    required
                  />
                </div>
                <Button type="submit" disabled={notifyLoading || !notifyMessage.trim()} className="w-full bg-primary hover:bg-primary/90">
                  {notifyLoading ? "Sending..." : `Send to ${notifySub.users?.email}`}
                </Button>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
