"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Check, X, Shield, Trash2, ChevronDown, ChevronUp, Phone, Mail, MapPin, Briefcase, Calendar, Search, Filter } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { DISTRICT_NAMES } from "@/lib/tn-districts";

interface PostingDetails {
  regular_district?: string;
  regular_block?: string;
  special_duty_district?: string;
  special_duty_block?: string;
  special_duty_place?: string;
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
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [tab, setTab] = useState("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("all");

  function loadUsers() {
    fetch("/api/users?status=" + (tab === "all" ? "" : tab))
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => {});
  }

  useEffect(() => {
    loadUsers();
    setExpandedId(null);
    setSearch("");
    setDistrictFilter("all");
  }, [tab]);

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
    return result;
  }, [users, search, districtFilter]);

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
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
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
          {users.length > 0 && filteredUsers.length !== users.length && (
            <p className="text-sm text-muted-foreground">Showing {filteredUsers.length} of {users.length} users</p>
          )}
          {filteredUsers.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">
              {users.length === 0 ? `No ${tab} users` : "No users match your search"}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((u) => {
                const isExpanded = expandedId === u.id;
                return (
                  <Card key={u.id}>
                    <CardContent className="pt-4">
                      {/* Header row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div
                          className="flex-1 cursor-pointer flex items-start gap-3"
                          onClick={() => setExpandedId(isExpanded ? null : u.id)}
                        >
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                            {u.photo_url ? <img src={u.photo_url} alt={u.name} className="w-full h-full object-cover" /> : <span className="text-sm font-semibold text-primary">{u.name?.charAt(0)?.toUpperCase() || "?"}</span>}
                          </div>
                          <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold uppercase">{u.name || "Unnamed"}</h3>
                            <Badge variant={u.role === "admin" ? "default" : "outline"} className="text-xs">
                              {u.role}
                            </Badge>
                            {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                          </div>
                          <p className="text-sm text-muted-foreground">{u.email}</p>
                          {u.occupation && <p className="text-xs text-muted-foreground">{u.occupation}</p>}
                          <p className="text-xs text-muted-foreground mt-1">
                            Joined: {formatDate(u.created_at)}
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
                          {tab === "approved" && u.role !== "admin" && (
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
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
