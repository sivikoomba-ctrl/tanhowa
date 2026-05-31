"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Search, Filter, Calendar, Upload, ExternalLink, ChevronDown, ChevronUp, Sparkles, CheckCircle, AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { fetchSignedPaymentProofUrl } from "@/lib/subscription-proofs";
import { DISTRICT_NAMES } from "@/lib/tn-districts";
import UserCard from "./_components/UserCard";
import EditUserDialog from "./_components/EditUserDialog";
import NudgeDialog from "./_components/NudgeDialog";

interface PostingDetails {
  regular_district?: string;
  regular_block?: string;
  special_duty_district?: string;
  special_duty_block?: string;
  special_duty_place?: string;
  special_designation?: string;
  special_farm?: string;
  deputed_district?: string;
  deputed_block?: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  office_address: string;
  dob: string;
  occupation: string;
  role: string;
  status: string;
  posting_details: PostingDetails;
  social_links: { instagram?: string; twitter?: string; linkedin?: string };
  photo_url: string;
  created_at: string;
  last_active_at: string | null;
  updated_at: string;
  profile_nudge: { fields: string[]; message: string; requested_at: string } | null;
  official_type: "state" | "district" | "volunteer" | null;
}

const PAGE_SIZE = 30;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [tab, setTab] = useState("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [designationFilter, setDesignationFilter] = useState("all");
  const [joinedFilter, setJoinedFilter] = useState("all");
  const [nudgeUserId, setNudgeUserId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState<{ name: string; url: string } | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [callerEmail, setCallerEmail] = useState("");
  const [suspendTarget, setSuspendTarget] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("non_payment");
  const [suspendRemarks, setSuspendRemarks] = useState("");
  const [subSheetUser, setSubSheetUser] = useState<{ id: string; name: string } | null>(null);
  const [subSheetData, setSubSheetData] = useState<{ id: string; period: string; amount: number; status: string; due_date: string | null; remarks: string | null; paid_amount: number | null; payment_proof_url: string | null; paid_at: string | null; transaction_id: string | null; payment_method: string | null; approved_at: string | null; approver: { name: string } | null }[]>([]);
  const [subSheetExpanded, setSubSheetExpanded] = useState<Set<string>>(new Set());
  const [subSheetLoading, setSubSheetLoading] = useState(false);
  const [subProofUploading, setSubProofUploading] = useState<string | null>(null);
  const [subProofTargetId, setSubProofTargetId] = useState<string | null>(null);
  const subProofInputRef = useRef<HTMLInputElement>(null);
  const [subExtracting, setSubExtracting] = useState<string | null>(null);
  const [subExtracted, setSubExtracted] = useState<Record<string, {
    date: string | null; time: string | null; transaction_id: string | null;
    payment_method: string | null; amount: number | null; paid_to: string | null;
    paid_account: string | null; is_tanhowa_payment: boolean;
  }>>({});

  useEffect(() => {
    fetch("/api/users/me").then(r => r.json()).then(d => { if (d.user?.email) setCallerEmail(d.user.email); }).catch(() => {});
  }, []);

  const loadUsers = useCallback(() => {
    fetch("/api/users?status=" + (tab === "all" ? "" : tab))
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => toast.error("Failed to load users"));
  }, [tab]);

  useEffect(() => {
    loadUsers();
    setExpandedId(null);
    setSearch("");
    setDistrictFilter("all");
    setDesignationFilter("all");
    setJoinedFilter("all");
    setVisibleCount(PAGE_SIZE);
    setSelectedIds(new Set());
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    let result = users;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          (u.name || "unnamed").toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.phone?.toLowerCase().includes(q) ||
          u.occupation?.toLowerCase().includes(q)
      );
    }
    if (districtFilter === "none") {
      result = result.filter((u) => !u.posting_details?.regular_district?.trim());
    } else if (districtFilter !== "all") {
      result = result.filter(
        (u) => u.posting_details?.regular_district === districtFilter
      );
    }
    if (designationFilter === "none") {
      result = result.filter((u) => !u.occupation?.trim());
    } else if (designationFilter !== "all") {
      const r = new RegExp(`\\b${designationFilter}\\b`, "i");
      result = result.filter((u) => r.test(u.occupation || ""));
    }
    if (joinedFilter !== "all") {
      const now = Date.now();
      // Hourly filters: filter by last_active_at (recently active users)
      const isActivityFilter = ["1h", "2h", "3h", "6h", "12h"].includes(joinedFilter);
      if (joinedFilter === "today") {
        const todayStr = new Date().toISOString().split("T")[0];
        result = result.filter((u) => u.last_active_at?.startsWith(todayStr));
      } else if (joinedFilter === "joined_today") {
        const todayStr = new Date().toISOString().split("T")[0];
        result = result.filter((u) => u.created_at?.startsWith(todayStr));
      } else {
        const cutoff = joinedFilter === "1h" ? now - 3600000
          : joinedFilter === "2h" ? now - 2 * 3600000
          : joinedFilter === "3h" ? now - 3 * 3600000
          : joinedFilter === "6h" ? now - 6 * 3600000
          : joinedFilter === "12h" ? now - 12 * 3600000
          : joinedFilter === "7d" ? now - 7 * 86400000
          : joinedFilter === "30d" ? now - 30 * 86400000
          : joinedFilter === "90d" ? now - 90 * 86400000
          : joinedFilter === "6m" ? now - 180 * 86400000
          : joinedFilter === "1y" ? now - 365 * 86400000
          : 0;
        if (isActivityFilter) {
          // Filter by last activity time
          result = result.filter((u) => u.last_active_at && new Date(u.last_active_at).getTime() >= cutoff);
        } else {
          // Filter by joined date
          result = result.filter((u) => new Date(u.created_at).getTime() >= cutoff);
        }
      }
    }
    // Sort: most recently active first, then by name
    result = [...result].sort((a, b) => {
      const aTime = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
      const bTime = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      return (a.name || "").localeCompare(b.name || "");
    });
    return result;
  }, [users, search, districtFilter, designationFilter, joinedFilter]);

  const onlineCount = useMemo(() => {
    const fiveMinAgo = Date.now() - 5 * 60000;
    return users.filter((u) => u.last_active_at && new Date(u.last_active_at).getTime() > fiveMinAgo).length;
  }, [users]);

  const recentActiveCount = useMemo(() => {
    const oneHourAgo = Date.now() - 60 * 60000;
    return users.filter((u) => u.last_active_at && new Date(u.last_active_at).getTime() > oneHourAgo).length;
  }, [users]);

  async function handleAction(userId: string, action: string, role?: string) {
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, role }),
    });

    if (res.ok) {
      toast.success(`User ${action}d successfully`);
      loadUsers();
      window.dispatchEvent(new Event("admin-users-changed"));
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Action failed");
    }
  }

  async function handleBulkAction(action: string) {
    if (selectedIds.size === 0) return;
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${selectedIds.size} user(s)?`)) return;
    setBulkLoading(true);
    let success = 0;
    const failures: string[] = [];
    for (const userId of selectedIds) {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      if (res.ok) {
        success++;
      } else {
        const err = await res.json().catch(() => null);
        if (err?.error) failures.push(err.error);
      }
    }
    if (success > 0) toast.success(`${success} user(s) ${action}d`);
    if (failures.length > 0) toast.error(`${failures.length} failed: ${failures[0]}`);
    setSelectedIds(new Set());
    setBulkLoading(false);
    loadUsers();
    window.dispatchEvent(new Event("admin-users-changed"));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const visible = filteredUsers.slice(0, visibleCount);
    if (selectedIds.size === visible.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visible.map((u) => u.id)));
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm("Are you sure you want to delete this user?")) return;

    const res = await fetch(`/api/admin/users?userId=${userId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("User deleted");
      loadUsers();
      window.dispatchEvent(new Event("admin-users-changed"));
    } else {
      const data = await res.json();
      toast.error(data.error || "Delete failed");
    }
  }

  async function handleVolunteerInvite(userId: string) {
    const res = await fetch("/api/volunteer-invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      toast.success("Volunteer invite sent!");
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to send invite");
    }
  }

  async function handleSetOfficial(userId: string, officialType: string | null) {
    const label = officialType === "state" ? "State Official" : officialType === "district" ? "District-Admin" : officialType === "volunteer" ? "Volunteer Admin" : "regular member";
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action: "set-official", officialType }),
    });
    if (res.ok) {
      toast.success(`User set as ${label}`);
      loadUsers();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Action failed");
    }
  }

  async function handleNudge(fields: string[], message: string) {
    if (!nudgeUserId || fields.length === 0) {
      toast.error("Select at least one field");
      return;
    }
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: nudgeUserId, action: "nudge", fields, message }),
    });
    if (res.ok) {
      toast.success("Update request sent to member");
      setNudgeUserId(null);
    } else {
      toast.error("Failed to send request");
    }
  }

  function openEditDialog(u: User) {
    setEditUser(u);
  }

  async function handleEditSave(userId: string, formData: {
    name: string;
    phone: string;
    occupation: string;
    address: string;
    office_address: string;
    dob: string;
    gender: string;
    posting_details: PostingDetails;
    social_links: Record<string, unknown>;
  }) {
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        action: "edit-profile",
        name: formData.name,
        phone: formData.phone,
        occupation: formData.occupation,
        address: formData.address,
        office_address: formData.office_address,
        dob: formData.dob || null,
        posting_details: formData.posting_details,
        social_links: formData.social_links,
      }),
    });
    if (res.ok) {
      toast.success("Profile updated");
      setEditUser(null);
      loadUsers();
    } else {
      toast.error("Failed to update");
    }
  }

  async function handleSuspend() {
    if (!suspendTarget) return;
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: suspendTarget, action: "suspend", reason: suspendReason, remarks: suspendRemarks }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Failed"); return; }
      toast.success("Member suspended");
      setSuspendTarget(null);
      setSuspendReason("non_payment");
      setSuspendRemarks("");
      loadUsers();
    } catch { toast.error("Failed to suspend member"); }
  }

  async function handleSubProofUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !subProofTargetId) return;
    const targetId = subProofTargetId;
    setSubProofUploading(targetId);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("subscription_id", targetId);
    try {
      const res = await fetch("/api/upload/payment-proof", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        toast.success("Proof uploaded — running AI extraction…");
        setSubSheetData((prev) => prev.map((s) => s.id === targetId ? { ...s, payment_proof_url: data.payment_proof_url } : s));
        setSubProofUploading(null);
        // Auto-extract immediately using the same file
        setSubExtracting(targetId);
        try {
          const extractForm = new FormData();
          extractForm.append("file", file);
          const extractRes = await fetch("/api/upload/payment-proof/extract-date", { method: "POST", body: extractForm });
          const extractData = await extractRes.json();
          setSubExtracted((prev) => ({ ...prev, [targetId]: extractData }));
        } catch {
          toast.error("AI extraction failed");
        }
        setSubExtracting(null);
      } else {
        toast.error(data.error || "Upload failed");
        setSubProofUploading(null);
      }
    } catch {
      toast.error("Upload failed");
      setSubProofUploading(null);
    }
    setSubProofTargetId(null);
    if (subProofInputRef.current) subProofInputRef.current.value = "";
  }

  async function handleExtractProof(subId: string, proofUrl: string) {
    setSubExtracting(subId);
    try {
      const signedUrl = await fetchSignedPaymentProofUrl(subId, proofUrl);
      const extractForm = new FormData();
      extractForm.append("image_url", signedUrl);
      const res = await fetch("/api/upload/payment-proof/extract-date", { method: "POST", body: extractForm });
      const data = await res.json();
      setSubExtracted((prev) => ({ ...prev, [subId]: data }));
    } catch {
      toast.error("AI extraction failed");
    }
    setSubExtracting(null);
  }

  function openSubSheet(userId: string) {
    const u = users.find((u) => u.id === userId);
    if (!u) return;
    setSubSheetUser({ id: userId, name: u.name });
    setSubSheetData([]);
    setSubSheetExpanded(new Set());
    setSubSheetLoading(true);
    fetch(`/api/subscriptions?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => setSubSheetData(d.subscriptions || []))
      .catch(() => toast.error("Failed to load subscriptions"))
      .finally(() => setSubSheetLoading(false));
  }

  function handleCardAction(userId: string, action: string, extra?: string) {
    if (action === "view-subscriptions") {
      openSubSheet(userId);
      return;
    }
    if (action === "delete") {
      handleDelete(userId);
    } else if (action === "suspend") {
      setSuspendTarget(userId);
    } else if (action === "reinstate") {
      if (!confirm("Reinstate this member? They will regain full portal access.")) return;
      handleAction(userId, "reinstate");
    } else if (action === "set-official-state") {
      handleSetOfficial(userId, "state");
    } else if (action === "set-official-district") {
      handleSetOfficial(userId, "district");
    } else if (action === "set-official-volunteer") {
      handleVolunteerInvite(userId);
    } else if (action === "remove-official") {
      handleSetOfficial(userId, null);
    } else if (action === "set-role") {
      handleAction(userId, action, extra);
    } else {
      handleAction(userId, action);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Manage Users</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-4">
          {users.length > 0 && (
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="font-medium text-green-700">{onlineCount} online</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="text-amber-700">{recentActiveCount} active (1h)</span>
              </span>
              <span className="text-muted-foreground">{users.length} total</span>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone, or designation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={joinedFilter} onValueChange={setJoinedFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Calendar size={14} className="mr-1 text-muted-foreground" />
                <SelectValue placeholder="Joined Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="1h">Active in 1 Hour</SelectItem>
                <SelectItem value="2h">Active in 2 Hours</SelectItem>
                <SelectItem value="3h">Active in 3 Hours</SelectItem>
                <SelectItem value="6h">Active in 6 Hours</SelectItem>
                <SelectItem value="12h">Active in 12 Hours</SelectItem>
                <SelectItem value="today">Active Today</SelectItem>
                <SelectItem value="joined_today">Joined Today</SelectItem>
                <SelectItem value="7d">Joined Last 7 Days</SelectItem>
                <SelectItem value="30d">Joined Last 30 Days</SelectItem>
                <SelectItem value="90d">Joined Last 3 Months</SelectItem>
                <SelectItem value="6m">Joined Last 6 Months</SelectItem>
                <SelectItem value="1y">Joined Last 1 Year</SelectItem>
              </SelectContent>
            </Select>
            <Select value={districtFilter} onValueChange={setDistrictFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <Filter size={14} className="mr-1 text-muted-foreground" />
                <SelectValue placeholder="All Districts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Districts</SelectItem>
                <SelectItem value="none">Not Set (Empty)</SelectItem>
                {DISTRICT_NAMES.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={designationFilter} onValueChange={setDesignationFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <Filter size={14} className="mr-1 text-muted-foreground" />
                <SelectValue placeholder="All Designations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Designations</SelectItem>
                <SelectItem value="none">Not Set (Empty)</SelectItem>
                <SelectItem value="HO">HO</SelectItem>
                <SelectItem value="ADH">ADH</SelectItem>
                <SelectItem value="DDH">DDH</SelectItem>
                <SelectItem value="JDH">JDH</SelectItem>
                <SelectItem value="ADDH">ADDH</SelectItem>
                <SelectItem value="System Admin">System Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {users.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground">
                <input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === Math.min(visibleCount, filteredUsers.length)} onChange={toggleSelectAll} className="accent-primary" />
                Select All
              </label>
              <p className="text-sm text-muted-foreground">
                {filteredUsers.length !== users.length
                  ? `Showing ${Math.min(visibleCount, filteredUsers.length)} of ${filteredUsers.length} (filtered from ${users.length})`
                  : `Showing ${Math.min(visibleCount, users.length)} of ${users.length} users`}
              </p>
            </div>
          )}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium text-primary">{selectedIds.size} selected</span>
              {(tab === "pending" || tab === "all") && (
                <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" disabled={bulkLoading} onClick={() => handleBulkAction("approve")}>
                  Approve All
                </Button>
              )}
              {(tab === "pending" || tab === "all") && (
                <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={bulkLoading} onClick={() => handleBulkAction("reject")}>
                  Reject All
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          )}
          {filteredUsers.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">
              {users.length === 0 ? `No ${tab} users` : "No users match your filters"}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredUsers.slice(0, visibleCount).map((u) => (
                <UserCard
                  key={u.id}
                  user={u}
                  isExpanded={expandedId === u.id}
                  isSelected={selectedIds.has(u.id)}
                  tab={tab}
                  onExpandToggle={() => setExpandedId(expandedId === u.id ? null : u.id)}
                  onSelectToggle={() => toggleSelect(u.id)}
                  onAction={(action, extra) => handleCardAction(u.id, action, extra)}
                  onEditClick={() => openEditDialog(u)}
                  onNudgeClick={() => { setNudgeUserId(u.id); }}
                  onPhotoZoom={(name, url) => setZoomPhoto({ name, url })}
                  callerEmail={callerEmail}
                />
              ))}
              {visibleCount < filteredUsers.length && (
                <div className="flex justify-center pt-2">
                  <Button variant="outline" size="sm" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                    Show More ({filteredUsers.length - visibleCount} remaining)
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Nudge Dialog */}
      <NudgeDialog
        open={!!nudgeUserId}
        onOpenChange={(open) => { if (!open) setNudgeUserId(null); }}
        onSend={handleNudge}
      />

      {/* Edit Profile Dialog */}
      <EditUserDialog
        user={editUser}
        open={!!editUser}
        onOpenChange={(open) => { if (!open) setEditUser(null); }}
        onSave={handleEditSave}
      />

      {/* Suspend Dialog */}
      <Dialog open={!!suspendTarget} onOpenChange={(open) => { if (!open) { setSuspendTarget(null); setSuspendReason("non_payment"); setSuspendRemarks(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Suspend Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Reason *</Label>
              <Select value={suspendReason} onValueChange={setSuspendReason}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="non_payment">Non-payment of subscriptions</SelectItem>
                  <SelectItem value="disciplinary">Disciplinary action</SelectItem>
                  <SelectItem value="voluntary">Voluntary withdrawal</SelectItem>
                  <SelectItem value="transfer">Transfer out of TN Horticulture</SelectItem>
                  <SelectItem value="retirement">Retirement</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Remarks (optional)</Label>
              <Textarea value={suspendRemarks} onChange={(e) => setSuspendRemarks(e.target.value)} className="mt-1" rows={2} placeholder="Additional details..." />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setSuspendTarget(null)}>Cancel</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={handleSuspend}>Suspend Member</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Subscriptions Sheet */}
      <Sheet open={!!subSheetUser} onOpenChange={(open) => { if (!open) setSubSheetUser(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="uppercase">{subSheetUser?.name} — Subscriptions</SheetTitle>
          </SheetHeader>
          {subSheetLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : subSheetData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No subscriptions found.</p>
          ) : (
            <div className="space-y-2">
              {subSheetData.map((s) => {
                const isOpen = subSheetExpanded.has(s.id);
                const toggle = () => setSubSheetExpanded((prev) => { const n = new Set(prev); isOpen ? n.delete(s.id) : n.add(s.id); return n; });
                return (
                  <div key={s.id} className="rounded-lg border text-sm overflow-hidden">
                    {/* Summary row — click to expand */}
                    <button className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors" onClick={toggle}>
                      <div className="min-w-0">
                        <p className="font-semibold">{s.period}</p>
                        <p className="text-xs text-muted-foreground">
                          ₹{(s.paid_amount ?? s.amount).toLocaleString("en-IN")}
                          {s.paid_amount && s.paid_amount !== s.amount && (
                            <span className="ml-1 text-amber-600">(bill ₹{s.amount.toLocaleString("en-IN")})</span>
                          )}
                          {s.due_date && <span className="ml-2">· Due {new Date(s.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={s.status} />
                        {isOpen ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                      </div>
                    </button>

                    {/* Expanded details */}
                    {isOpen && (
                      <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
                        {/* Remarks */}
                        {s.remarks && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Remarks</p>
                            <p className="text-xs">{s.remarks}</p>
                          </div>
                        )}

                        {/* Payment details grid */}
                        {(s.paid_at || s.payment_method || s.transaction_id || s.approved_at) && (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                            {s.paid_at && <><span className="text-muted-foreground">Paid on</span><span>{new Date(s.paid_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></>}
                            {s.payment_method && <><span className="text-muted-foreground">Method</span><span>{s.payment_method}</span></>}
                            {s.transaction_id && <><span className="text-muted-foreground">Txn ID</span><span className="font-mono break-all">{s.transaction_id}</span></>}
                            {s.approved_at && <><span className="text-muted-foreground">Approved</span><span>{new Date(s.approved_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}{s.approver ? ` · ${s.approver.name}` : ""}</span></>}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center flex-wrap gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={subProofUploading === s.id}
                            onClick={() => { setSubProofTargetId(s.id); subProofInputRef.current?.click(); }}
                          >
                            <Upload size={12} className="mr-1" />
                            {subProofUploading === s.id ? "Uploading..." : s.payment_proof_url ? "Re-upload Proof" : "Upload Proof"}
                          </Button>
                          {s.payment_proof_url && !subExtracted[s.id] && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-violet-700 border-violet-200 hover:bg-violet-50"
                              disabled={subExtracting === s.id}
                              onClick={() => handleExtractProof(s.id, s.payment_proof_url!)}
                            >
                              <Sparkles size={12} className="mr-1" />
                              {subExtracting === s.id ? "Extracting..." : "AI Extract"}
                            </Button>
                          )}
                          {s.payment_proof_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-primary"
                              onClick={async () => {
                                try {
                                  const url = await fetchSignedPaymentProofUrl(s.id, s.payment_proof_url!);
                                  window.open(url, "_blank");
                                } catch { toast.error("Failed to open proof"); }
                              }}
                            >
                              <ExternalLink size={12} className="mr-1" />
                              View Proof
                            </Button>
                          )}
                        </div>

                        {/* AI extraction result */}
                        {(subExtracting === s.id || subExtracted[s.id]) && (
                          <div className={`rounded-lg p-3 text-xs space-y-2 ${
                            subExtracting === s.id ? "bg-violet-50 border border-violet-200" :
                            subExtracted[s.id]?.is_tanhowa_payment ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"
                          }`}>
                            {subExtracting === s.id ? (
                              <p className="text-violet-700 animate-pulse flex items-center gap-1.5">
                                <Sparkles size={11} /> AI is extracting payment details…
                              </p>
                            ) : subExtracted[s.id] && (() => {
                              const ex = subExtracted[s.id];
                              return (
                                <>
                                  <div className="flex items-center gap-1.5 font-medium">
                                    {ex.is_tanhowa_payment ? (
                                      <><CheckCircle size={12} className="text-green-600" /><span className="text-green-700">TANHOWA Payment Verified</span></>
                                    ) : (
                                      <><AlertTriangle size={12} className="text-amber-600" /><span className="text-amber-700">Payee unclear — verify manually</span></>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                    {ex.date && <><span className="text-muted-foreground">Date</span><span>{ex.date}{ex.time ? ` ${ex.time}` : ""}</span></>}
                                    {ex.transaction_id && <><span className="text-muted-foreground">Txn ID</span><span className="font-mono break-all">{ex.transaction_id}</span></>}
                                    {ex.payment_method && <><span className="text-muted-foreground">Method</span><span>{ex.payment_method}</span></>}
                                    {ex.amount != null && <><span className="text-muted-foreground">Amount</span><span>₹{ex.amount.toLocaleString("en-IN")}</span></>}
                                    {ex.paid_to && <><span className="text-muted-foreground">Paid To</span><span>{ex.paid_to}</span></>}
                                    {ex.paid_account && <><span className="text-muted-foreground">Account</span><span className="font-mono">{ex.paid_account}</span></>}
                                  </div>
                                  <button className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => setSubExtracted(prev => { const n = {...prev}; delete n[s.id]; return n; })}>Clear</button>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground text-center pt-2">{subSheetData.length} subscription{subSheetData.length !== 1 ? "s" : ""}</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <input ref={subProofInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleSubProofUpload} />

      {/* Photo Zoom Dialog */}
      <Dialog open={!!zoomPhoto} onOpenChange={(open) => !open && setZoomPhoto(null)}>
        <DialogContent className="max-w-sm p-2">
          <DialogHeader>
            <DialogTitle className="text-center text-sm">{zoomPhoto?.name}</DialogTitle>
          </DialogHeader>
          {zoomPhoto?.url && (
            <div className="rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={zoomPhoto.url} alt={zoomPhoto.name} className="w-full h-auto" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
