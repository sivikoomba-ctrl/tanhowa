"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Crown, Building2, Phone, Mail, MapPin, Briefcase, Plus, X, Search, Users } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  occupation: string;
  photo_url: string;
  role: string;
  official_type: "state" | "district" | "volunteer" | null;
  status: string;
  posting_details?: {
    regular_district?: string;
    regular_block?: string;
    official_designation?: string;
  };
}

export default function AdminOfficialsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [tab, setTab] = useState("state");
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<"state" | "district" | "volunteer">("state");
  const [memberSearch, setMemberSearch] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Check if current user is a district official (DS/DJS) vs super_admin/state
  const isDistrictOfficial = currentUser?.official_type === "district" && currentUser?.role === "admin";
  const isSuperOrState = currentUser?.role === "super_admin" || currentUser?.official_type === "state";
  const callerDistrict = currentUser?.posting_details?.regular_district;

  function loadUsers() {
    fetch("/api/users?status=approved")
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => toast.error("Failed to load officials"));
  }

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => { if (d.user) setCurrentUser(d.user); })
      .catch(() => {});
    loadUsers();
  }, []);

  const stateOfficials = useMemo(() => users.filter((u) => u.official_type === "state"), [users]);
  const districtOfficials = useMemo(() => users.filter((u) => u.official_type === "district"), [users]);
  const volunteerOfficials = useMemo(() => {
    const vols = users.filter((u) => u.official_type === "volunteer");
    // DS/DJS only see volunteers in their district
    if (isDistrictOfficial && !isSuperOrState && callerDistrict) {
      return vols.filter((u) => u.posting_details?.regular_district === callerDistrict);
    }
    return vols;
  }, [users, isDistrictOfficial, isSuperOrState, callerDistrict]);

  const districtGroups = useMemo(() => {
    const groups: Record<string, User[]> = {};
    for (const o of districtOfficials) {
      const district = o.posting_details?.regular_district || "Unassigned";
      if (!groups[district]) groups[district] = [];
      groups[district].push(o);
    }
    // Sort within each district: Secretary before Joint Secretary
    for (const members of Object.values(groups)) {
      members.sort((a, b) => {
        const aIsSecretary = a.posting_details?.official_designation === "District Secretary" ? 0 : 1;
        const bIsSecretary = b.posting_details?.official_designation === "District Secretary" ? 0 : 1;
        return aIsSecretary - bIsSecretary;
      });
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [districtOfficials]);

  const volunteerGroups = useMemo(() => {
    const groups: Record<string, User[]> = {};
    for (const o of volunteerOfficials) {
      const district = o.posting_details?.regular_district || "Unassigned";
      if (!groups[district]) groups[district] = [];
      groups[district].push(o);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [volunteerOfficials]);

  // Available members for adding (approved, not already an official)
  const availableMembers = useMemo(() => {
    const q = memberSearch.toLowerCase();
    return users
      .filter((u) => u.status === "approved" && !u.official_type)
      .filter((u) => {
        // DS/DJS adding volunteers: only show members from their district
        if (addType === "volunteer" && isDistrictOfficial && !isSuperOrState && callerDistrict) {
          return u.posting_details?.regular_district === callerDistrict;
        }
        return true;
      })
      .filter((u) => !q || (u.name || "").toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.occupation?.toLowerCase().includes(q));
  }, [users, memberSearch, addType, isDistrictOfficial, isSuperOrState, callerDistrict]);

  async function handleSetOfficial(userId: string, officialType: string | null) {
    // Volunteer: send invite instead of direct assignment
    if (officialType === "volunteer") {
      const res = await fetch("/api/volunteer-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        toast.success("Volunteer invite sent! The member will be notified.");
        setShowAdd(false);
        setMemberSearch("");
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to send invite");
      }
      return;
    }

    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action: "set-official", officialType }),
    });
    if (res.ok) {
      const label = officialType === "state" ? "State Official" : officialType === "district" ? "District-Admin" : "regular member";
      toast.success(`Set as ${label}`);
      loadUsers();
      setShowAdd(false);
      setMemberSearch("");
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Action failed");
    }
  }

  function openAddDialog(type: "state" | "district" | "volunteer") {
    setAddType(type);
    setMemberSearch("");
    setShowAdd(true);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Officials Management</h1>

      <Tabs value={isDistrictOfficial && !isSuperOrState ? "volunteer" : tab} onValueChange={setTab}>
        <TabsList>
          {(!isDistrictOfficial || isSuperOrState) && (
            <>
              <TabsTrigger value="state" className="gap-1.5">
                <Crown size={14} />State Officials ({stateOfficials.length})
              </TabsTrigger>
              <TabsTrigger value="district" className="gap-1.5">
                <Building2 size={14} />District Officials ({districtOfficials.length})
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="volunteer" className="gap-1.5">
            <Users size={14} />Volunteers ({volunteerOfficials.length})
          </TabsTrigger>
        </TabsList>

        {/* State Officials */}
        <TabsContent value="state" className="mt-4 space-y-4">
          <Button onClick={() => openAddDialog("state")} className="bg-purple-600 hover:bg-purple-700">
            <Plus size={16} className="mr-1" />Add State Official
          </Button>
          {stateOfficials.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No State Officials designated</p>
          ) : (
            <div className="space-y-3">
              {stateOfficials.map((u) => (
                <OfficialRow key={u.id} user={u} onRemove={() => handleSetOfficial(u.id, null)} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* District Officials */}
        <TabsContent value="district" className="mt-4 space-y-4">
          <Button onClick={() => openAddDialog("district")} className="bg-blue-600 hover:bg-blue-700">
            <Plus size={16} className="mr-1" />Add District Official
          </Button>
          {districtOfficials.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No District Officials designated</p>
          ) : (
            <div className="space-y-6">
              {districtGroups.map(([district, members]) => (
                <div key={district}>
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin size={16} className="text-blue-600" />
                    <h2 className="text-lg font-semibold text-blue-800">{district}</h2>
                    <Badge variant="outline" className="text-xs">{members.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {members.map((u) => (
                      <OfficialRow key={u.id} user={u} onRemove={() => handleSetOfficial(u.id, null)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Volunteer Admins */}
        <TabsContent value="volunteer" className="mt-4 space-y-4">
          <Button onClick={() => openAddDialog("volunteer")} className="bg-green-600 hover:bg-green-700">
            <Plus size={16} className="mr-1" />Invite Volunteer Admin
            {isDistrictOfficial && !isSuperOrState && callerDistrict && <span className="ml-1 text-xs opacity-80">({callerDistrict})</span>}
          </Button>
          {volunteerOfficials.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No Volunteer Admins designated</p>
          ) : (
            <div className="space-y-6">
              {volunteerGroups.map(([district, members]) => (
                <div key={district}>
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin size={16} className="text-green-600" />
                    <h2 className="text-lg font-semibold text-green-800">{district}</h2>
                    <Badge variant="outline" className="text-xs">{members.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {members.map((u) => (
                      <OfficialRow key={u.id} user={u} onRemove={() => handleSetOfficial(u.id, null)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Official Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add {addType === "state" ? "State" : addType === "district" ? "District" : "Volunteer"} {addType === "volunteer" ? "Admin" : "Official"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or designation..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {availableMembers.length === 0 ? (
                <p className="text-muted-foreground text-center py-4 text-sm">No available members found</p>
              ) : (
                availableMembers.slice(0, 20).map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border hover:bg-muted/50">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="w-9 h-9">
                        {u.photo_url && <AvatarImage src={u.photo_url} />}
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                          {u.name?.charAt(0)?.toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate uppercase">{u.name || "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.occupation || u.email}</p>
                        {u.posting_details?.regular_district && (
                          <p className="text-xs text-muted-foreground">{u.posting_details.regular_district}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSetOfficial(u.id, addType)}
                      className={addType === "state" ? "bg-purple-600 hover:bg-purple-700" : addType === "volunteer" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}
                    >
                      {addType === "volunteer" ? "Invite" : "Add"}
                    </Button>
                  </div>
                ))
              )}
              {availableMembers.length > 20 && (
                <p className="text-xs text-muted-foreground text-center">Showing first 20. Search to narrow down.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OfficialRow({ user: u, onRemove }: { user: User; onRemove: () => void }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar className="w-11 h-11 border-2 border-primary/20">
              {u.photo_url && <AvatarImage src={u.photo_url} />}
              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                {u.name?.charAt(0)?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm uppercase truncate">{u.name || "Unnamed"}</h3>
                <Badge className={`text-xs ${u.official_type === "state" ? "bg-purple-600 hover:bg-purple-600 text-white" : u.official_type === "volunteer" ? "bg-green-600 hover:bg-green-600 text-white" : u.posting_details?.official_designation?.includes("Joint") ? "bg-teal-600 hover:bg-teal-600 text-white" : "bg-blue-600 hover:bg-blue-600 text-white"}`}>
                  {u.official_type === "state" ? <><Crown size={10} className="mr-1" />State</> : u.official_type === "volunteer" ? <><Users size={10} className="mr-1" />Volunteer Admin</> : <><Building2 size={10} className="mr-1" />{u.posting_details?.official_designation || "District"}</>}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1 flex-wrap">
                {u.occupation && <span className="flex items-center gap-1"><Briefcase size={11} />{u.occupation}</span>}
                {u.posting_details?.regular_district && <span className="flex items-center gap-1"><MapPin size={11} />{u.posting_details.regular_district}{u.posting_details.regular_block && ` — ${u.posting_details.regular_block}`}</span>}
                {u.phone && <span className="flex items-center gap-1"><Phone size={11} />{u.phone}</span>}
                {u.email && <span className="flex items-center gap-1"><Mail size={11} />{u.email}</span>}
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 shrink-0" onClick={onRemove}>
            <X size={14} className="mr-1" />Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
