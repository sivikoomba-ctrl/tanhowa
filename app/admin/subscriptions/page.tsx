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
} from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils";

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
  payment_group_id: string | null;
  created_at: string;
  users?: { name: string; email: string; phone: string; posting_details?: { regular_district?: string } };
  approver?: { name: string } | null;
}

interface Stats {
  paid: number;
  pending: number;
  overdue: number;
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
  const [stats, setStats] = useState<Stats>({ paid: 0, pending: 0, overdue: 0, totalCollected: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [filterDistrict, setFilterDistrict] = useState("all");

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

  // Admin member picker for bulk payments
  const [adminSelectedMembers, setAdminSelectedMembers] = useState<Set<string>>(new Set());
  const [adminMemberSearch, setAdminMemberSearch] = useState("");
  // Same member, other periods (split payment across years)
  const [adminSelectedPeriods, setAdminSelectedPeriods] = useState<Set<string>>(new Set());

  // Proof preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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
  const [specialOpen, setSpecialOpen] = useState(false);
  const [specialForm, setSpecialForm] = useState({ period: "For UATT 2.0 Case 2025", amount: "3000", due_date: "" });
  const [specialLoading, setSpecialLoading] = useState(false);

  // Past year subscription dialog
  const [pastOpen, setPastOpen] = useState(false);
  const [pastForm, setPastForm] = useState({ period: String(currentYear - 1), amount: "", due_date: "", status: "paid", paid_at: "", remarks: "" });
  const [pastLoading, setPastLoading] = useState(false);
  const [pastMembers, setPastMembers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [pastSelected, setPastSelected] = useState<Set<string>>(new Set());
  const [pastSearch, setPastSearch] = useState("");
  const [pastFile, setPastFile] = useState<File | null>(null);

  // Admin proof upload
  const adminFileInputRef = useRef<HTMLInputElement>(null);
  const [adminUploadTargetId, setAdminUploadTargetId] = useState<string | null>(null);
  const [adminUploading, setAdminUploading] = useState<string | null>(null);

  // Page loading
  const [pageLoading, setPageLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

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

  function load() {
    setPageLoading(true);
    Promise.all([
      fetch("/api/subscriptions").then((r) => r.json()),
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

  function syncMembers() {
    setSyncing(true);
    fetch("/api/subscriptions?sync=true")
      .then((r) => r.json())
      .then((d) => {
        setSubscriptions(d.subscriptions || []);
        if (d.stats) setStats(d.stats);
        toast.success("Members synced");
      })
      .catch(() => toast.error("Sync failed"))
      .finally(() => setSyncing(false));
  }

  function loadPastMembers() {
    fetch("/api/users?status=approved")
      .then((r) => r.json())
      .then((d) => {
        const members = (d.users || [])
          .filter((u: { role: string }) => u.role !== "admin" && u.role !== "super_admin")
          .map((u: { id: string; name: string; email: string }) => ({ id: u.id, name: u.name || "", email: u.email }));
        setPastMembers(members);
      })
      .catch(() => {});
  }

  async function handlePastCreate(e: React.FormEvent) {
    e.preventDefault();
    if (pastSelected.size === 0) {
      toast.error("Select at least one member");
      return;
    }
    setPastLoading(true);

    // Upload payment proof first if provided
    let paymentProofUrl: string | null = null;
    if (pastFile) {
      const formData = new FormData();
      formData.append("file", pastFile);
      const uploadRes = await fetch("/api/upload/payment-proof", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        toast.error(uploadData.error || "Failed to upload payment proof");
        setPastLoading(false);
        return;
      }
      paymentProofUrl = uploadData.payment_proof_url;
    }

    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "past-create",
        user_ids: Array.from(pastSelected),
        period: pastForm.period,
        amount: parseFloat(pastForm.amount) || 0,
        due_date: pastForm.due_date || null,
        status: pastForm.status,
        paid_at: pastForm.status === "paid" && pastForm.paid_at ? new Date(`${pastForm.paid_at}T12:00:00`).toISOString() : null,
        remarks: pastForm.remarks || null,
        payment_proof_url: paymentProofUrl,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(data.message);
      setPastOpen(false);
      setPastSelected(new Set());
      setPastFile(null);
      setPastForm({ period: String(currentYear - 1), amount: "", due_date: "", status: "paid", paid_at: "", remarks: "" });
      load();
    } else {
      toast.error(data.error || "Failed");
    }
    setPastLoading(false);
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
  }, []);

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
        (filterStatus === "proof-uploaded" ? !!sub.payment_proof_url && sub.status !== "paid" && sub.status !== "rejected" && sub.status !== "hold" : sub.status === filterStatus);
      const matchesPeriod = filterPeriod === "all" || sub.period === filterPeriod;
      const matchesDistrict = filterDistrict === "all" || sub.users?.posting_details?.regular_district === filterDistrict;
      return matchesSearch && matchesStatus && matchesPeriod && matchesDistrict;
    });
  }, [subscriptions, searchQuery, filterStatus, filterPeriod, filterDistrict]);

  async function handleBulkCreate(e: React.FormEvent) {
    e.preventDefault();
    setBulkLoading(true);
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "bulk-create",
        period: bulkForm.period,
        amount: parseFloat(bulkForm.amount) || 0,
        due_date: bulkForm.due_date || null,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(`Created ${data.count} subscription entries for ${bulkForm.period}`);
      setBulkOpen(false);
      setBulkForm({ period: String(currentYear), amount: "", due_date: "" });
      load();
    } else {
      toast.error(data.error || "Failed");
    }
    setBulkLoading(false);
  }

  async function handleSpecialCreate(e: React.FormEvent) {
    e.preventDefault();
    setSpecialLoading(true);
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "bulk-create",
        period: specialForm.period,
        amount: parseFloat(specialForm.amount) || 3000,
        due_date: specialForm.due_date || null,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(`Created ${data.count} special subscription entries`);
      setSpecialOpen(false);
      setSpecialForm({ period: "For UATT 2.0 Case 2025", amount: "3000", due_date: "" });
      load();
    } else {
      toast.error(data.error || "Failed");
    }
    setSpecialLoading(false);
  }

  async function handleVerifyPaid(e: React.FormEvent) {
    e.preventDefault();
    if (!payDialog) return;
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

    const res = await fetch("/api/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: payDialog.id,
        status: "paid",
        remarks: payForm.remarks || payDialog.remarks,
        paid_at: paidAt,
        transaction_id: payForm.transaction_id || payDialog.transaction_id,
        payment_method: payForm.payment_method || payDialog.payment_method,
        ...(payForm.amount ? { amount: parseFloat(payForm.amount) } : {}),
        ...(groupId ? { payment_group_id: groupId } : {}),
      }),
    });
    if (res.ok) {
      let extraCount = 0;

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
            if (periodRes.ok) extraCount++;
          } catch { /* continue */ }
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
            if (linkedRes.ok) extraCount++;
          } catch { /* continue */ }
        }
      }

      if (extraCount > 0) {
        toast.success(`Payment verified + ${extraCount} additional subscription${extraCount > 1 ? "s" : ""}`);
      } else {
        toast.success("Payment verified and marked as paid");
      }
      setPayDialog(null);
      setPayForm({ remarks: "", payment_date: "", payment_time: "", verified_email: "", transaction_id: "", payment_method: "", amount: "" });
      setAdminSelectedMembers(new Set());
      setAdminMemberSearch("");
      setAdminSelectedPeriods(new Set());
      load();
    } else {
      toast.error("Failed to update");
    }
    setPayLoading(false);
  }

  async function viewProof(sub: Subscription) {
    if (!sub.payment_proof_url) return;
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/upload/payment-proof/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: sub.payment_proof_url, subscription_id: sub.id }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setPreviewUrl(data.url);
      } else {
        toast.error("Failed to load proof");
      }
    } catch {
      toast.error("Failed to load proof");
    }
    setPreviewLoading(false);
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
        toast.success("Payment proof uploaded!");
        load();
        // If verify dialog is open for this subscription, refresh the proof image
        if (payDialog?.id === adminUploadTargetId) {
          const signedRes = await fetch("/api/upload/payment-proof/signed-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file_path: data.payment_proof_url, subscription_id: adminUploadTargetId }),
          });
          const signedData = await signedRes.json();
          if (signedRes.ok && signedData.url) {
            setPayProofUrl(signedData.url);
            setPayDialog((prev) => prev ? { ...prev, payment_proof_url: data.payment_proof_url } : prev);
            // Auto-extract from uploaded file
            setExtractingDate(true);
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
                  ...(extData.transaction_id && !prev.transaction_id ? { transaction_id: extData.transaction_id } : {}),
                  ...(extData.payment_method && !prev.payment_method ? { payment_method: extData.payment_method } : {}),
                  ...(extData.amount ? { amount: String(extData.amount) } : {}),
                }));
              }
            } catch { /* best-effort */ }
            setExtractingDate(false);
          }
        }
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
          <Button variant="outline" size="sm" onClick={syncMembers} disabled={syncing}>
            <Users size={16} className="mr-1" />
            {syncing ? "Syncing..." : "Sync Members"}
          </Button>
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
          <Dialog open={pastOpen} onOpenChange={(open) => { setPastOpen(open); if (open && pastMembers.length === 0) loadPastMembers(); }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <History size={16} className="mr-1" />
                Past Year Subscription
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Past Year Subscription</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">Create subscription entries for selected members for a past year. Useful for recording historical payments.</p>
              <form onSubmit={handlePastCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Year *</Label>
                    <Select value={pastForm.period} onValueChange={(val) => setPastForm({ ...pastForm, period: val })}>
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
                      value={pastForm.amount}
                      onChange={(e) => setPastForm({ ...pastForm, amount: e.target.value })}
                      placeholder="500"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Status</Label>
                    <Select value={pastForm.status} onValueChange={(val) => setPastForm({ ...pastForm, status: val })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paid">Already Paid</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {pastForm.status === "paid" && (
                    <div>
                      <Label>Payment Date</Label>
                      <Input
                        type="date"
                        value={pastForm.paid_at}
                        onChange={(e) => setPastForm({ ...pastForm, paid_at: e.target.value })}
                      />
                    </div>
                  )}
                  {pastForm.status === "pending" && (
                    <div>
                      <Label>Due Date</Label>
                      <Input
                        type="date"
                        value={pastForm.due_date}
                        onChange={(e) => setPastForm({ ...pastForm, due_date: e.target.value })}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <Label>Remarks</Label>
                  <Input
                    value={pastForm.remarks}
                    onChange={(e) => setPastForm({ ...pastForm, remarks: e.target.value })}
                    placeholder="e.g. Cash payment collected at meeting"
                  />
                </div>
                <div>
                  <Label>Payment Proof (optional)</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <label className="flex items-center gap-2 px-3 py-2 border rounded-xl cursor-pointer hover:bg-muted/50 text-sm w-full">
                      <Upload size={16} className="text-muted-foreground shrink-0" />
                      <span className="truncate text-muted-foreground">
                        {pastFile ? pastFile.name : "Upload JPEG, PNG, or WebP (max 5MB)"}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            if (f.size > 5 * 1024 * 1024) {
                              toast.error("File must be under 5MB");
                              return;
                            }
                            setPastFile(f);
                          }
                        }}
                      />
                    </label>
                    {pastFile && (
                      <Button type="button" variant="ghost" size="sm" className="h-9 px-2 shrink-0" onClick={() => setPastFile(null)}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
                {pastSelected.size > 1 && pastForm.amount && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm">
                    <p className="font-medium text-amber-800">
                      Total: ₹{((parseFloat(pastForm.amount) || 0) * pastSelected.size).toLocaleString("en-IN")}
                    </p>
                    <p className="text-amber-600 text-xs">
                      ₹{parseFloat(pastForm.amount).toLocaleString("en-IN")} × {pastSelected.size} members — please verify this matches the payment proof
                    </p>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Select Members ({pastSelected.size} selected)</Label>
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                        const visible = pastMembers.filter((m) => {
                          if (!pastSearch) return true;
                          const q = pastSearch.toLowerCase();
                          return m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q);
                        });
                        setPastSelected(new Set(visible.map((m) => m.id)));
                      }}>Select All</Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPastSelected(new Set())}>Clear</Button>
                    </div>
                  </div>
                  <Input
                    placeholder="Search members..."
                    value={pastSearch}
                    onChange={(e) => setPastSearch(e.target.value)}
                    className="mb-2"
                  />
                  <div className="border rounded-xl max-h-[200px] overflow-y-auto divide-y">
                    {pastMembers
                      .filter((m) => {
                        if (!pastSearch) return true;
                        const q = pastSearch.toLowerCase();
                        return m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q);
                      })
                      .map((m) => (
                        <label key={m.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={pastSelected.has(m.id)}
                            onChange={() => {
                              setPastSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(m.id)) next.delete(m.id);
                                else next.add(m.id);
                                return next;
                              });
                            }}
                            className="rounded"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate uppercase">{m.name || "Unnamed"}</p>
                            <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                          </div>
                        </label>
                      ))}
                    {pastMembers.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Loading members...</p>
                    )}
                  </div>
                </div>
                <Button type="submit" disabled={pastLoading || pastSelected.size === 0} className="w-full bg-primary hover:bg-primary/90">
                  {pastLoading ? "Creating..." : `Create for ${pastSelected.size} Member${pastSelected.size !== 1 ? "s" : ""}`}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={specialOpen} onOpenChange={setSpecialOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-accent text-accent hover:bg-accent/10">
                <Plus size={16} className="mr-1" />
                Special Subscription
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Special Subscription</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">This creates a pending special subscription entry for every approved member. Use for legal case funds, one-time levies, etc.</p>
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
                  <Label>Amount (&#8377;) *</Label>
                  <Input
                    type="number"
                    value={specialForm.amount}
                    onChange={(e) => setSpecialForm({ ...specialForm, amount: e.target.value })}
                    placeholder="3000"
                    required
                  />
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={specialForm.due_date}
                    onChange={(e) => setSpecialForm({ ...specialForm, due_date: e.target.value })}
                  />
                </div>
                <Button type="submit" disabled={specialLoading} className="w-full bg-accent hover:bg-accent/90 text-white">
                  {specialLoading ? "Creating..." : "Create for All Members"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90">
                <Plus size={16} className="mr-1" />
                New Year Subscription
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Yearly Subscription</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">This creates a pending subscription entry for every approved member for the selected year.</p>
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
              <Button type="submit" disabled={bulkLoading} className="w-full bg-primary hover:bg-primary/90">
                {bulkLoading ? "Creating..." : "Create for All Members"}
              </Button>
            </form>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Paid</p>
                <p className="text-2xl font-bold text-green-600">{stats.paid}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
              </div>
              <Clock className="w-8 h-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Collected</p>
                <p className="text-2xl font-bold">&#8377;{stats.totalCollected.toLocaleString("en-IN")}</p>
              </div>
              <IndianRupee className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
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
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="proof-uploaded">Proof Uploaded (Awaiting Approval)</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger className="w-[120px]">
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
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Districts</SelectItem>
                  {districts.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

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
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-sm truncate uppercase">{sub.users?.name || "Unknown"}</h3>
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
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{sub.users?.email} {sub.users?.phone && `| ${sub.users.phone}`}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">{sub.period}</Badge>
                        {sub.period.toLowerCase().startsWith("volunteer") && (
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 text-[10px]">Voluntary</Badge>
                        )}
                        <span className="text-sm font-semibold">&#8377;{sub.amount?.toLocaleString("en-IN") || 0}</span>
                        {sub.due_date && <span className="text-xs text-muted-foreground">Due: {formatDate(sub.due_date)}</span>}
                        {sub.paid_at && <span className="text-xs text-green-600">Paid: {formatDateTime(sub.paid_at)}</span>}
                      </div>
                      {sub.transaction_id && (
                        <p className="text-xs text-muted-foreground mt-1">Txn ID: <span className="font-mono">{sub.transaction_id}</span></p>
                      )}
                      {sub.payment_method && (
                        <p className="text-xs text-muted-foreground">Method: {sub.payment_method}</p>
                      )}
                      {sub.remarks && <p className="text-xs text-muted-foreground">Note: {sub.remarks}</p>}
                      {sub.approved_at && (
                        <p className="text-xs text-muted-foreground">
                          Approved: {formatDateTime(sub.approved_at)}
                          {sub.approver?.name && <> by <span className="font-medium">{sub.approver.name}</span></>}
                        </p>
                      )}
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
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
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
                              setPayForm({
                                remarks: "",
                                payment_date: today.toISOString().split("T")[0],
                                payment_time: today.toTimeString().slice(0, 5),
                                verified_email: sub.users?.email || "",
                                transaction_id: sub.transaction_id || "",
                                payment_method: sub.payment_method || "",
                                amount: sub.amount ? String(sub.amount) : "",
                              });
                              setPayProofUrl(null);
                              setExtractingDate(false);
                              setAdminSelectedMembers(new Set());
                              setAdminMemberSearch("");
                              if (sub.payment_proof_url) {
                                const res = await fetch("/api/upload/payment-proof/signed-url", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ file_path: sub.payment_proof_url, subscription_id: sub.id }),
                                });
                                const data = await res.json();
                                if (res.ok && data.url) {
                                  setPayProofUrl(data.url);
                                  // Extract date/time from proof image using AI
                                  setExtractingDate(true);
                                  try {
                                    const fd = new FormData();
                                    fd.append("image_url", data.url);
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
                                      // Also reflect AI-extracted values in the member-submitted display
                                      setPayDialog((prev) => prev ? {
                                        ...prev,
                                        ...(extData.transaction_id && !prev.transaction_id ? { transaction_id: extData.transaction_id } : {}),
                                        ...(extData.payment_method && !prev.payment_method ? { payment_method: extData.payment_method } : {}),
                                      } : prev);
                                    }
                                  } catch {}
                                  setExtractingDate(false);
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleRevert(sub.id)}
                        >
                          Revert
                        </Button>
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
              <div className="rounded-xl border overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-4 py-3 font-semibold">S.No</th>
                      <th className="text-left px-4 py-3 font-semibold">District</th>
                      <th className="text-center px-4 py-3 font-semibold">Members</th>
                      {districtPeriods.map((p) => (
                        <th key={p} className="text-right px-4 py-3 font-semibold whitespace-nowrap">
                          {/^\d{4}$/.test(p) ? p : <span title={p} className="cursor-help border-b border-dashed border-muted-foreground">{p.replace(/^For\s+/i, "").replace(/\s+Case\s+\d{4}$/i, "")}</span>}
                        </th>
                      ))}
                      <th className="text-right px-4 py-3 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {districtRows.map((row, i) => (
                      <tr key={row.district} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium">{row.district}</td>
                        <td className="px-4 py-2.5 text-center">{row.members}</td>
                        {districtPeriods.map((p) => (
                          <td key={p} className="px-4 py-2.5 text-right font-mono">
                            {(row[p] as number) > 0 ? `₹${(row[p] as number).toLocaleString("en-IN")}` : "—"}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right font-semibold font-mono">
                          {(row.total as number) > 0 ? `₹${(row.total as number).toLocaleString("en-IN")}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {districtGrandTotal && (
                    <tfoot>
                      <tr className="bg-primary/5 font-bold border-t-2">
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3">TOTAL</td>
                        <td className="px-4 py-3 text-center">{districtGrandTotal.members}</td>
                        {districtPeriods.map((p) => (
                          <td key={p} className="px-4 py-3 text-right font-mono">
                            ₹{((districtGrandTotal[p] as number) || 0).toLocaleString("en-IN")}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right font-mono">
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
      <Dialog open={!!payDialog} onOpenChange={(open) => !open && setPayDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Verify & Approve Payment</DialogTitle>
          </DialogHeader>
          {payDialog && (
            <div className="space-y-5">
              {/* Member Info Section */}
              <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Member Details</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name</span>
                    <p className="font-medium">{payDialog.users?.name || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email</span>
                    <p className="font-medium">{payDialog.users?.email || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Phone</span>
                    <p className="font-medium">{payDialog.users?.phone || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Subscription</span>
                    <p className="font-medium">{payDialog.period} — &#8377;{payDialog.amount?.toLocaleString("en-IN")}</p>
                  </div>
                </div>
              </div>

              {/* Member-Submitted Payment Info */}
              <div className="rounded-xl border bg-blue-50/50 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Member-Submitted Details (cross-verify with proof)</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Transaction ID</span>
                    <p className="font-mono font-medium">{payDialog.transaction_id || <span className="text-amber-600 italic">Not provided</span>}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Payment Method</span>
                    <p className="font-medium">{payDialog.payment_method || <span className="text-amber-600 italic">Not provided</span>}</p>
                  </div>
                  {payDialog.remarks && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Member Note</span>
                      <p className="font-medium">{payDialog.remarks}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Bulk Payment — Linked Members */}
              {payDialog.remarks && (() => {
                // Parse structured sub_ids from remarks
                const subIdsMatch = payDialog.remarks?.match(/\[sub_ids:([^\]]+)\]/);
                const linkedSubIds = subIdsMatch ? subIdsMatch[1].split(",").map((s: string) => s.trim()).filter(Boolean) : [];

                // Extract mentioned names from remarks, excluding the paying member
                const behalfMatch = payDialog.remarks?.match(/Paying on behalf of:\s*(.+?)(?:\s*\[sub_ids:|$)/i);
                const payerFull = (payDialog.users?.name || "").toLowerCase().trim();
                const payerParts = payerFull.split(/\s+/).filter((p: string) => p.length > 1);
                const mentionedNames = (behalfMatch
                  ? behalfMatch[1].split(",").map((n: string) => n.trim()).filter(Boolean)
                  : payDialog.remarks?.includes(",")
                    ? payDialog.remarks?.split(",").map((n: string) => n.trim()).filter(Boolean) || []
                    : []
                ).filter((n: string) => {
                  const nameLower = n.toLowerCase().trim();
                  if (nameLower === payerFull) return false;
                  return !payerParts.some((part: string) => nameLower === part);
                });
                const namesList = mentionedNames.join(", ");

                if (mentionedNames.length === 0 && linkedSubIds.length === 0) return null;

                // Find linked subscriptions from loaded data
                const linkedSubs = linkedSubIds.length > 0
                  ? subscriptions.filter((s) => linkedSubIds.includes(s.id))
                  : [];

                return (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <Users className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-amber-800">
                          Bulk Payment — {linkedSubs.length > 0 ? linkedSubs.length : mentionedNames.length} Other Member{(linkedSubs.length > 0 ? linkedSubs.length : mentionedNames.length) > 1 ? "s" : ""}
                        </h4>
                        {linkedSubs.length > 0 ? (
                          <div className="space-y-1.5">
                            {linkedSubs.map((ls) => (
                              <div key={ls.id} className="flex items-center justify-between text-xs">
                                <span className="font-medium">{ls.users?.name || ls.users?.email}</span>
                                <Badge variant={ls.status === "paid" ? "default" : "outline"} className="text-[10px] h-5">
                                  {ls.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-amber-700">
                            Members: <span className="font-semibold uppercase">{namesList}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* One-click bulk verify for linked subs */}
                    {linkedSubs.filter((s) => s.status !== "paid").length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        className="w-full bg-green-600 hover:bg-green-700 text-xs"
                        disabled={payLoading}
                        onClick={async () => {
                          if (!confirm(`Verify payment for ${linkedSubs.filter((s) => s.status !== "paid").length} linked member(s) too?`)) return;
                          setPayLoading(true);
                          try {
                            const unpaidIds = linkedSubs.filter((s) => s.status !== "paid").map((s) => s.id);
                            // Build paid_at from form
                            let paidAt: string | undefined;
                            if (payForm.payment_date) {
                              const time = payForm.payment_time || "12:00";
                              paidAt = new Date(`${payForm.payment_date}T${time}:00`).toISOString();
                            }
                            // Verify each linked subscription
                            for (const subId of unpaidIds) {
                              await fetch("/api/subscriptions", {
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
                                  ...(payForm.amount && payDialog.amount ? { amount: payDialog.amount } : {}),
                                }),
                              });
                            }
                            toast.success(`Verified ${unpaidIds.length} linked member(s)`);
                            load();
                          } catch {
                            toast.error("Failed to verify linked members");
                          }
                          setPayLoading(false);
                        }}
                      >
                        <CheckCircle2 size={14} className="mr-1" />
                        Verify All {linkedSubs.filter((s) => s.status !== "paid").length} Linked Member{linkedSubs.filter((s) => s.status !== "paid").length > 1 ? "s" : ""}
                      </Button>
                    )}

                    {/* Fallback: copy message for unstructured names */}
                    {linkedSubs.length === 0 && (
                      <div className="bg-white rounded-lg border border-amber-200 p-3">
                        <p className="text-xs text-muted-foreground mb-1.5 font-medium">Polite message to send to the paying member:</p>
                        <p className="text-xs text-foreground leading-relaxed">
                          Dear {payDialog.users?.name || "Member"},<br /><br />
                          Thank you for your bulk payment. We noticed members: <strong>{namesList}</strong>.<br /><br />
                          Please ensure all members are registered on tanhowa.in so their subscriptions can be approved.<br /><br />
                          Warm regards, TANHOWA Admin
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2 h-7 text-xs"
                          onClick={() => {
                            const msg = `Dear ${payDialog.users?.name || "Member"},\n\nThank you for your bulk payment towards TANHOWA subscription.\n\nWe noticed the following members: ${namesList}.\n\nPlease ensure all members are registered on tanhowa.in so their subscriptions can be approved.\n\nWarm regards,\nTANHOWA Admin`;
                            navigator.clipboard.writeText(msg);
                            toast.success("Message copied to clipboard");
                          }}
                        >
                          <Copy size={12} className="mr-1" />
                          Copy Message
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Payment Proof Image */}
              {payDialog.payment_proof_url && payProofUrl && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Payment Proof Image</h3>
                  <div className="rounded-xl overflow-hidden border bg-white">
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

              {/* Admin Verification Form */}
              <form onSubmit={handleVerifyPaid} className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Admin Verification</h3>

                <div>
                  <Label>Member Email (confirm identity) *</Label>
                  <Input
                    value={payForm.verified_email}
                    onChange={(e) => setPayForm({ ...payForm, verified_email: e.target.value })}
                    placeholder="Enter member's email"
                    required
                  />
                  {payForm.verified_email && payForm.verified_email !== payDialog.users?.email && (
                    <p className="text-xs text-red-600 mt-1 font-medium">Email does not match member record ({payDialog.users?.email})</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Transaction ID (from proof)</Label>
                    <Input
                      value={payForm.transaction_id}
                      onChange={(e) => setPayForm({ ...payForm, transaction_id: e.target.value })}
                      placeholder="UPI ref / UTR / bank ref"
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <Label>Payment Method</Label>
                    <Input
                      value={payForm.payment_method}
                      onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })}
                      placeholder="e.g. UPI, Google Pay, NEFT"
                    />
                  </div>
                </div>

                <div>
                  <Label>Amount Paid (&#8377;)</Label>
                  <Input
                    type="number"
                    value={payForm.amount}
                    onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                    placeholder="e.g. 3000"
                  />
                  {payDialog && payDialog.amount && payForm.amount && parseFloat(payForm.amount) !== payDialog.amount && (
                    <p className="text-xs text-amber-600 mt-1">
                      Subscription amount: &#8377;{payDialog.amount.toLocaleString("en-IN")} — Proof amount: &#8377;{parseFloat(payForm.amount).toLocaleString("en-IN")}
                    </p>
                  )}
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
                              <span className="font-semibold">{s.period}</span>
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
                  const isExpanded = adminSelectedMembers.size > 0 || adminMemberSearch.length > 0;
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
                      Extracting payment date & time from proof image...
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
                  disabled={payLoading || (payForm.verified_email !== payDialog.users?.email)}
                  className="w-full bg-green-600 hover:bg-green-700 h-11 text-base"
                >
                  {payLoading ? "Verifying..." : "Confirm Payment Received"}
                </Button>
                {payForm.verified_email && payForm.verified_email !== payDialog.users?.email && (
                  <p className="text-xs text-red-500 text-center">Cannot approve — email mismatch. Please verify the correct member.</p>
                )}
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Proof Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment Proof</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="rounded-xl overflow-hidden border">
              <img src={previewUrl} alt="Payment proof" className="w-full" />
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                        <p className="text-sm font-medium truncate uppercase">{sub.users?.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground truncate">{sub.users?.email} {sub.users?.phone && `| ${sub.users.phone}`}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant="secondary" className="text-[10px]">{sub.period}</Badge>
                        {sub.period.toLowerCase().startsWith("volunteer") && (
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 text-[10px] ml-1">Voluntary</Badge>
                        )}
                        <p className="text-xs font-semibold">&#8377;{sub.amount?.toLocaleString("en-IN")}</p>
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
              <div>
                <Label>Reason / Remarks *</Label>
                <Textarea
                  value={rejectRemarks}
                  onChange={(e) => setRejectRemarks(e.target.value)}
                  placeholder="e.g. Payment proof is unclear, amount mismatch, duplicate entry..."
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
