"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Check, X, Shield, Trash2, ChevronDown, ChevronUp, Phone, Mail, MapPin, Briefcase, Calendar, Search, Filter, Send, Clock, Crown, Building2, Pencil, Copy } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { DISTRICT_NAMES, getBlocks } from "@/lib/tn-districts";

const nudgeFieldOptions = [
  { value: "Name", label: "Name *" },
  { value: "Phone", label: "Phone *" },
  { value: "Date of Birth", label: "Date of Birth" },
  { value: "Gender", label: "Gender" },
  { value: "Designation", label: "Designation *" },
  { value: "Qualification", label: "Qualification" },
  { value: "Home Address", label: "Home Address" },
  { value: "Office Address", label: "Office Address" },
  { value: "Posting Details", label: "Posting Details" },
  { value: "Photo", label: "Photo" },
  { value: "Experience", label: "Experience" },
  { value: "Skill Sets", label: "Skill Sets" },
  { value: "Social Links", label: "Social Links" },
];

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
  profile_nudge: { fields: string[]; message: string; requested_at: string } | null;
  official_type: "state" | "district" | null;
}

const PAGE_SIZE = 30;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [tab, setTab] = useState("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [joinedFilter, setJoinedFilter] = useState("all");
  const [nudgeUserId, setNudgeUserId] = useState<string | null>(null);
  const [nudgeFields, setNudgeFields] = useState<string[]>([]);
  const [nudgeMessage, setNudgeMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState<{ name: string; url: string } | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", occupation: "", address: "", office_address: "", dob: "", gender: "", regular_district: "", regular_block: "", special_duty_district: "", special_duty_block: "", deputed_district: "", deputed_block: "" });
  const [editSaving, setEditSaving] = useState(false);

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
    if (districtFilter !== "all") {
      result = result.filter(
        (u) => u.posting_details?.regular_district === districtFilter
      );
    }
    if (joinedFilter !== "all") {
      if (joinedFilter === "today") {
        const todayStr = new Date().toISOString().split("T")[0];
        result = result.filter((u) => u.created_at?.startsWith(todayStr));
      } else {
        const now = Date.now();
        const cutoff = joinedFilter === "7d" ? now - 7 * 86400000
          : joinedFilter === "30d" ? now - 30 * 86400000
          : joinedFilter === "90d" ? now - 90 * 86400000
          : joinedFilter === "6m" ? now - 180 * 86400000
          : joinedFilter === "1y" ? now - 365 * 86400000
          : 0;
        result = result.filter((u) => new Date(u.created_at).getTime() >= cutoff);
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
  }, [users, search, districtFilter, joinedFilter]);

  const onlineCount = useMemo(() => {
    const fiveMinAgo = Date.now() - 5 * 60000;
    return users.filter((u) => u.last_active_at && new Date(u.last_active_at).getTime() > fiveMinAgo).length;
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
      toast.error("Action failed");
    }
  }

  async function handleBulkAction(action: string) {
    if (selectedIds.size === 0) return;
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${selectedIds.size} user(s)?`)) return;
    setBulkLoading(true);
    let success = 0;
    for (const userId of selectedIds) {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      if (res.ok) success++;
    }
    toast.success(`${success} user(s) ${action}d`);
    setSelectedIds(new Set());
    setBulkLoading(false);
    loadUsers();
    window.dispatchEvent(new Event("admin-users-changed"));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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

  async function handleSetOfficial(userId: string, officialType: string | null) {
    const label = officialType === "state" ? "State Official" : officialType === "district" ? "District Official" : "regular member";
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action: "set-official", officialType }),
    });
    if (res.ok) {
      toast.success(`User set as ${label}`);
      loadUsers();
    } else {
      toast.error("Action failed");
    }
  }

  async function handleNudge() {
    if (!nudgeUserId || nudgeFields.length === 0) {
      toast.error("Select at least one field");
      return;
    }
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: nudgeUserId, action: "nudge", fields: nudgeFields, message: nudgeMessage }),
    });
    if (res.ok) {
      toast.success("Update request sent to member");
      setNudgeUserId(null);
      setNudgeFields([]);
      setNudgeMessage("");
    } else {
      toast.error("Failed to send request");
    }
  }

  function openEditDialog(u: User) {
    setEditUser(u);
    setEditForm({
      name: (u.name || "").toUpperCase(),
      phone: u.phone || "",
      occupation: u.occupation || "",
      address: u.address || "",
      office_address: u.office_address || "",
      dob: u.dob || "",
      gender: (u as unknown as { social_links?: { gender?: string } }).social_links?.gender || "",
      regular_district: u.posting_details?.regular_district || "",
      regular_block: u.posting_details?.regular_block || "",
      special_duty_district: u.posting_details?.special_duty_district || "",
      special_duty_block: u.posting_details?.special_duty_block || "",
      deputed_district: u.posting_details?.deputed_district || "",
      deputed_block: u.posting_details?.deputed_block || "",
    });
  }

  async function handleEditSave() {
    if (!editUser) return;
    setEditSaving(true);
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: editUser.id,
        action: "edit-profile",
        name: editForm.name,
        phone: editForm.phone,
        occupation: editForm.occupation,
        address: editForm.address,
        office_address: editForm.office_address,
        dob: editForm.dob || null,
        posting_details: {
          ...editUser.posting_details,
          regular_district: editForm.regular_district,
          regular_block: editForm.regular_block,
          special_duty_district: editForm.special_duty_district,
          special_duty_block: editForm.special_duty_block,
          deputed_district: editForm.deputed_district,
          deputed_block: editForm.deputed_block,
        },
        social_links: {
          ...(editUser as unknown as { social_links?: Record<string, unknown> }).social_links,
          gender: editForm.gender || "",
        },
      }),
    });
    if (res.ok) {
      toast.success("Profile updated");
      setEditUser(null);
      loadUsers();
    } else {
      toast.error("Failed to update");
    }
    setEditSaving(false);
  }

  function getActivityStatus(lastActive: string | null): { label: string; color: string; dot: string } {
    if (!lastActive) return { label: "Never", color: "text-muted-foreground", dot: "bg-gray-300" };
    const diff = Date.now() - new Date(lastActive).getTime();
    const mins = diff / 60000;
    if (mins < 5) return { label: "Online", color: "text-green-600", dot: "bg-green-500" };
    if (mins < 60) return { label: `${Math.floor(mins)}m ago`, color: "text-green-600", dot: "bg-green-400" };
    const hours = diff / 3600000;
    if (hours < 24) return { label: `${Math.floor(hours)}h ago`, color: "text-amber-600", dot: "bg-amber-400" };
    const days = diff / 86400000;
    return { label: `${Math.floor(days)}d ago`, color: "text-muted-foreground", dot: "bg-gray-300" };
  }

  function hasPosting(p?: PostingDetails) {
    if (!p) return false;
    return !!(p.regular_district || p.regular_block || p.special_duty_district || p.special_duty_block || p.special_duty_place || p.deputed_district || p.deputed_block);
  }

  function hasSocial(s?: { instagram?: string; twitter?: string; linkedin?: string }) {
    if (!s) return false;
    return !!(s.instagram || s.twitter || s.linkedin);
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
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="90d">Last 3 Months</SelectItem>
                <SelectItem value="6m">Last 6 Months</SelectItem>
                <SelectItem value="1y">Last 1 Year</SelectItem>
              </SelectContent>
            </Select>
            <Select value={districtFilter} onValueChange={setDistrictFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <Filter size={14} className="mr-1 text-muted-foreground" />
                <SelectValue placeholder="All Districts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Districts</SelectItem>
                {DISTRICT_NAMES.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
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
                {onlineCount > 0 && (
                  <span className="ml-2 text-green-600 font-medium">
                    ({onlineCount} online)
                  </span>
                )}
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
              {filteredUsers.slice(0, visibleCount).map((u) => {
                const isExpanded = expandedId === u.id;
                return (
                  <Card key={u.id} className={selectedIds.has(u.id) ? "border-primary/50 bg-primary/[0.02]" : ""}>
                    <CardContent className="pt-4">
                      {/* Header row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div
                          className="flex-1 cursor-pointer flex items-start gap-3"
                          onClick={() => setExpandedId(isExpanded ? null : u.id)}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(u.id)}
                            onChange={(e) => { e.stopPropagation(); toggleSelect(u.id); }}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-3 shrink-0 accent-primary"
                          />
                          <div className="relative shrink-0">
                            <div
                              className={`w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden ${u.photo_url ? "cursor-zoom-in" : ""}`}
                              onClick={(e) => { if (u.photo_url) { e.stopPropagation(); setZoomPhoto({ name: u.name, url: u.photo_url }); } }}
                            >
                              {u.photo_url ? <Image src={u.photo_url} alt={u.name} width={80} height={80} unoptimized className="w-full h-full object-cover" /> : <span className="text-sm font-semibold text-primary">{u.name?.charAt(0)?.toUpperCase() || "?"}</span>}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${getActivityStatus(u.last_active_at).dot}`} title={getActivityStatus(u.last_active_at).label} />
                          </div>
                          <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold uppercase">{u.name || "Unnamed"}</h3>
                            <button
                              className="text-muted-foreground hover:text-primary transition-colors"
                              title="Copy name"
                              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(u.name || ""); toast.success("Copied"); }}
                            >
                              <Copy size={12} />
                            </button>
                            <Badge variant={u.role === "admin" || u.role === "super_admin" ? "default" : "outline"} className={`text-xs ${u.role === "super_admin" ? "bg-amber-600 hover:bg-amber-600" : ""}`}>
                              {u.role === "super_admin" ? "Super Admin" : u.role}
                            </Badge>
                            {u.official_type === "state" && (
                              <Badge className="text-xs bg-purple-600 hover:bg-purple-600 text-white">
                                <Crown size={10} className="mr-1" />State Official
                              </Badge>
                            )}
                            {u.official_type === "district" && (
                              <Badge className="text-xs bg-blue-600 hover:bg-blue-600 text-white">
                                <Building2 size={10} className="mr-1" />District Official
                              </Badge>
                            )}
                            {tab === "all" && (
                              <Badge className={`text-xs ${u.status === "approved" ? "bg-green-100 text-green-800 hover:bg-green-100" : u.status === "pending" ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-red-100 text-red-800 hover:bg-red-100"}`}>
                                {u.status}
                              </Badge>
                            )}
                            {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                          </div>
                          <p className="text-sm text-muted-foreground">{u.email}</p>
                          {u.occupation && <p className="text-xs text-muted-foreground">{u.occupation}</p>}
                          <p className="text-xs text-muted-foreground mt-1">
                            Joined: {formatDate(u.created_at)}
                            {u.last_active_at && (
                              <span className={`ml-3 ${getActivityStatus(u.last_active_at).color}`}>
                                Active: {getActivityStatus(u.last_active_at).label}
                              </span>
                            )}
                          </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {tab === "pending" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleAction(u.id, "approve")}
                                className="bg-primary hover:bg-primary/90"
                              >
                                <Check size={14} className="mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleAction(u.id, "reject")}
                              >
                                <X size={14} className="mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                          {tab === "approved" && u.role !== "admin" && u.role !== "super_admin" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction(u.id, "set-role", "admin")}
                            >
                              <Shield size={14} className="mr-1" />
                              Make Admin
                            </Button>
                          )}
                          {tab === "approved" && u.role === "admin" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction(u.id, "set-role", "member")}
                            >
                              Remove Admin
                            </Button>
                          )}
                          {(tab === "approved" || (tab === "all" && u.status === "approved")) && !u.official_type && (
                            <>
                              <Button size="sm" variant="outline" className="text-purple-700 border-purple-300 hover:bg-purple-50" onClick={() => handleSetOfficial(u.id, "state")}>
                                <Crown size={14} className="mr-1" />State Official
                              </Button>
                              <Button size="sm" variant="outline" className="text-blue-700 border-blue-300 hover:bg-blue-50" onClick={() => handleSetOfficial(u.id, "district")}>
                                <Building2 size={14} className="mr-1" />District Official
                              </Button>
                            </>
                          )}
                          {(tab === "approved" || (tab === "all" && u.status === "approved")) && u.official_type && (
                            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleSetOfficial(u.id, null)}>
                              <X size={14} className="mr-1" />Remove Official
                            </Button>
                          )}
                          {tab === "rejected" && (
                            <Button
                              size="sm"
                              onClick={() => handleAction(u.id, "approve")}
                              className="bg-primary hover:bg-primary/90"
                            >
                              <Check size={14} className="mr-1" />
                              Approve
                            </Button>
                          )}
                          {tab === "all" && u.status !== "approved" && (
                            <Button
                              size="sm"
                              onClick={() => handleAction(u.id, "approve")}
                              className="bg-primary hover:bg-primary/90"
                            >
                              <Check size={14} className="mr-1" />
                              Approve
                            </Button>
                          )}
                          {tab === "all" && u.status === "approved" && u.role !== "admin" && u.role !== "super_admin" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction(u.id, "set-role", "admin")}
                            >
                              <Shield size={14} className="mr-1" />
                              Make Admin
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(u.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div className="flex items-start gap-2">
                              <Mail size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Email</p>
                                <p className="font-medium">{u.email}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <Phone size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Phone</p>
                                <p className="font-medium">{u.phone || "—"}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <Calendar size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Date of Birth</p>
                                <p className="font-medium">{u.dob ? formatDate(u.dob) : "—"}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <Briefcase size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Designation</p>
                                <p className="font-medium">{u.occupation || "—"}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <MapPin size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Home Address</p>
                                <p className="font-medium">{u.address || "—"}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <MapPin size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Office Address</p>
                                <p className="font-medium">{u.office_address || "—"}</p>
                              </div>
                            </div>
                          </div>

                          {/* Posting Details */}
                          {hasPosting(u.posting_details) && (
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Posting Details</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm bg-muted/50 rounded-lg p-3">
                                {(u.posting_details.regular_district || u.posting_details.regular_block) && (
                                  <div>
                                    <p className="text-xs font-semibold text-primary">Regular Posting</p>
                                    {u.posting_details.regular_district && <p>District: {u.posting_details.regular_district}</p>}
                                    {u.posting_details.regular_block && <p>Block: {u.posting_details.regular_block}</p>}
                                  </div>
                                )}
                                {(u.posting_details.special_duty_district || u.posting_details.special_duty_block || u.posting_details.special_duty_place) && (
                                  <div>
                                    <p className="text-xs font-semibold text-accent">Special Duty</p>
                                    {u.posting_details.special_duty_district && <p>District: {u.posting_details.special_duty_district}</p>}
                                    {u.posting_details.special_duty_block && <p>Block: {u.posting_details.special_duty_block}</p>}
                                    {u.posting_details.special_duty_place && <p>Place: {u.posting_details.special_duty_place}</p>}
                                  </div>
                                )}
                                {(u.posting_details.deputed_district || u.posting_details.deputed_block) && (
                                  <div>
                                    <p className="text-xs font-semibold text-secondary">Deputed</p>
                                    {u.posting_details.deputed_district && <p>District: {u.posting_details.deputed_district}</p>}
                                    {u.posting_details.deputed_block && <p>Block: {u.posting_details.deputed_block}</p>}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Request Update */}
                          {(tab === "approved" || (tab === "all" && u.status === "approved")) && (
                            <div className="space-y-2">
                              {u.profile_nudge && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                                  <div className="flex items-center gap-2 text-amber-800 font-medium mb-1">
                                    <Clock size={14} />
                                    Update requested on {new Date(u.profile_nudge.requested_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                                  </div>
                                  <p className="text-amber-700">Fields: {u.profile_nudge.fields.join(", ")}</p>
                                  {u.profile_nudge.message && <p className="text-amber-600 text-xs mt-1">{u.profile_nudge.message}</p>}
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEditDialog(u)}
                                  className="text-primary border-primary/30 hover:bg-primary/5"
                                >
                                  <Pencil size={14} className="mr-1" />
                                  Edit Profile
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { setNudgeUserId(u.id); setNudgeFields([]); setNudgeMessage(""); }}
                                  className="text-amber-700 border-amber-300 hover:bg-amber-50"
                                >
                                  <Send size={14} className="mr-1" />
                                  {u.profile_nudge ? "Send New Request" : "Request Update"}
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Social Links */}
                          {hasSocial(u.social_links) && (
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Social Links</h4>
                              <div className="flex flex-wrap gap-3 text-sm">
                                {u.social_links.instagram && (
                                  <Badge variant="outline">Instagram: {u.social_links.instagram}</Badge>
                                )}
                                {u.social_links.twitter && (
                                  <Badge variant="outline">Twitter: {u.social_links.twitter}</Badge>
                                )}
                                {u.social_links.linkedin && (
                                  <Badge variant="outline">LinkedIn: {u.social_links.linkedin}</Badge>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
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
      <Dialog open={!!nudgeUserId} onOpenChange={(open) => { if (!open) setNudgeUserId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Profile Update</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Select fields to update *</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {nudgeFieldOptions.map((f) => (
                  <label key={f.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={nudgeFields.includes(f.value)}
                      onChange={(e) => {
                        if (e.target.checked) setNudgeFields([...nudgeFields, f.value]);
                        else setNudgeFields(nudgeFields.filter((v) => v !== f.value));
                      }}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Message (optional)</Label>
              <Textarea
                value={nudgeMessage}
                onChange={(e) => setNudgeMessage(e.target.value)}
                placeholder="e.g., Please update your posting details after your recent transfer"
                rows={2}
                className="mt-1"
              />
            </div>
            <Button onClick={handleNudge} disabled={nudgeFields.length === 0} className="w-full bg-primary hover:bg-primary/90">
              <Send size={14} className="mr-2" />
              Send Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Member Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value.toUpperCase() })} className="uppercase" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Phone</Label>
                <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
              <div>
                <Label className="text-sm">Designation</Label>
                <Input value={editForm.occupation} onChange={(e) => setEditForm({ ...editForm, occupation: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Date of Birth</Label>
                <Input type="date" value={editForm.dob} onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })} />
              </div>
              <div>
                <Label className="text-sm">Gender</Label>
                <Select value={editForm.gender || "none"} onValueChange={(v) => setEditForm({ ...editForm, gender: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Regular Posting</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">District</Label>
                <Select value={editForm.regular_district || "none"} onValueChange={(v) => setEditForm({ ...editForm, regular_district: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    {DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Block</Label>
                {editForm.regular_district && getBlocks(editForm.regular_district).length > 0 ? (
                  <Select value={editForm.regular_block || "none"} onValueChange={(v) => setEditForm({ ...editForm, regular_block: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Select block" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select</SelectItem>
                      {getBlocks(editForm.regular_district).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={editForm.regular_block} onChange={(e) => setEditForm({ ...editForm, regular_block: e.target.value })} />
                )}
              </div>
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Special Duty</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">District</Label>
                <Select value={editForm.special_duty_district || "none"} onValueChange={(v) => setEditForm({ ...editForm, special_duty_district: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    {DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Block</Label>
                {editForm.special_duty_district && getBlocks(editForm.special_duty_district).length > 0 ? (
                  <Select value={editForm.special_duty_block || "none"} onValueChange={(v) => setEditForm({ ...editForm, special_duty_block: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Select block" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select</SelectItem>
                      {getBlocks(editForm.special_duty_district).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={editForm.special_duty_block} onChange={(e) => setEditForm({ ...editForm, special_duty_block: e.target.value })} />
                )}
              </div>
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Deputation</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">District</Label>
                <Select value={editForm.deputed_district || "none"} onValueChange={(v) => setEditForm({ ...editForm, deputed_district: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    {DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Block</Label>
                {editForm.deputed_district && getBlocks(editForm.deputed_district).length > 0 ? (
                  <Select value={editForm.deputed_block || "none"} onValueChange={(v) => setEditForm({ ...editForm, deputed_block: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Select block" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select</SelectItem>
                      {getBlocks(editForm.deputed_district).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={editForm.deputed_block} onChange={(e) => setEditForm({ ...editForm, deputed_block: e.target.value })} />
                )}
              </div>
            </div>
            <div>
              <Label className="text-sm">Home Address</Label>
              <Textarea value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} rows={2} />
            </div>
            <div>
              <Label className="text-sm">Office Address</Label>
              <Textarea value={editForm.office_address} onChange={(e) => setEditForm({ ...editForm, office_address: e.target.value })} rows={2} />
            </div>
            <Button onClick={handleEditSave} disabled={editSaving} className="w-full bg-primary hover:bg-primary/90">
              <Pencil size={14} className="mr-2" />
              {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
