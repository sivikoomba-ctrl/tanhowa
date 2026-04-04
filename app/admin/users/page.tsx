"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Filter, Calendar } from "lucide-react";
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
  const [joinedFilter, setJoinedFilter] = useState("all");
  const [nudgeUserId, setNudgeUserId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState<{ name: string; url: string } | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);

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
    const label = officialType === "state" ? "State Official" : officialType === "district" ? "District-Admin" : "regular member";
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

  function handleCardAction(userId: string, action: string, extra?: string) {
    if (action === "delete") {
      handleDelete(userId);
    } else if (action === "set-official-state") {
      handleSetOfficial(userId, "state");
    } else if (action === "set-official-district") {
      handleSetOfficial(userId, "district");
    } else if (action === "set-official-volunteer") {
      handleSetOfficial(userId, "volunteer");
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
                <SelectItem value="1h">Last 1 Hour</SelectItem>
                <SelectItem value="2h">Last 2 Hours</SelectItem>
                <SelectItem value="3h">Last 3 Hours</SelectItem>
                <SelectItem value="6h">Last 6 Hours</SelectItem>
                <SelectItem value="12h">Last 12 Hours</SelectItem>
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
