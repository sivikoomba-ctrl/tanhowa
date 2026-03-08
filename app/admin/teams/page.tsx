"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, UsersRound, Search, X, Check } from "lucide-react";
import { toast } from "sonner";

interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  photo_url: string;
  occupation: string;
  role: string;
  posting_details?: {
    regular_district?: string;
    regular_block?: string;
  };
}

interface TeamMember extends Member {
  team_role: string;
}

interface Team {
  id: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
  members: TeamMember[];
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    try {
      const [teamsRes, membersRes] = await Promise.all([
        fetch("/api/teams").then((r) => r.json()),
        fetch("/api/users").then((r) => r.json()),
      ]);
      setTeams(teamsRes.teams || []);
      setAllMembers(membersRes.users || []);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  function openCreate() {
    setEditingTeam(null);
    setFormName("");
    setFormDescription("");
    setFormSortOrder(teams.length);
    setSelectedMemberIds([]);
    setMemberSearch("");
    setShowDialog(true);
  }

  function openEdit(team: Team) {
    setEditingTeam(team);
    setFormName(team.name);
    setFormDescription(team.description);
    setFormSortOrder(team.sort_order);
    setSelectedMemberIds(team.members.map((m) => m.id));
    setMemberSearch("");
    setShowDialog(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error("Team name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription.trim(),
        sort_order: formSortOrder,
        member_ids: selectedMemberIds,
        ...(editingTeam ? { id: editingTeam.id } : {}),
      };

      const res = await fetch("/api/teams", {
        method: editingTeam ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      toast.success(editingTeam ? "Team updated" : "Team created");
      setShowDialog(false);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save team");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(team: Team) {
    if (!confirm(`Delete "${team.name}" team? This will remove all member assignments.`)) return;

    try {
      const res = await fetch(`/api/teams?id=${team.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Team deleted");
      fetchData();
    } catch {
      toast.error("Failed to delete team");
    }
  }

  function toggleMember(userId: string) {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  const filteredMembers = useMemo(() => {
    if (!memberSearch) return allMembers;
    const q = memberSearch.toLowerCase();
    return allMembers.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.occupation?.toLowerCase().includes(q) ||
        m.posting_details?.regular_district?.toLowerCase().includes(q)
    );
  }, [allMembers, memberSearch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manage Teams</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus size={16} />
          Create Team
        </Button>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <UsersRound className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No teams yet. Create your first team to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {teams.map((team) => (
            <Card key={team.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <UsersRound size={20} className="text-primary" />
                    {team.name}
                    <Badge variant="outline" className="ml-2 text-xs">
                      {team.members.length} member{team.members.length !== 1 ? "s" : ""}
                    </Badge>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(team)}>
                      <Pencil size={16} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(team)} className="text-destructive hover:text-destructive">
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
                {team.description && (
                  <p className="text-sm text-muted-foreground mt-1">{team.description}</p>
                )}
              </CardHeader>
              <CardContent>
                {team.members.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {team.members.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-1.5">
                        <Avatar className="w-7 h-7">
                          {m.photo_url && <AvatarImage src={m.photo_url} alt={m.name} />}
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {m.name?.charAt(0)?.toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate uppercase">{m.name}</p>
                          {m.occupation && <p className="text-[10px] text-muted-foreground truncate">{m.occupation}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No members assigned yet.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Team Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTeam ? "Edit Team" : "Create Team"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Team Name</Label>
              <Input
                placeholder="e.g. Finance Team"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Brief description of this team's purpose..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Display Order</Label>
              <Input
                type="number"
                value={formSortOrder}
                onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                className="w-24"
              />
            </div>

            <div className="space-y-2">
              <Label>
                Members
                {selectedMemberIds.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({selectedMemberIds.length} selected)
                  </span>
                )}
              </Label>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search members..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Selected members chips */}
              {selectedMemberIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedMemberIds.map((id) => {
                    const m = allMembers.find((mem) => mem.id === id);
                    if (!m) return null;
                    return (
                      <div key={id} className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-medium">
                        {m.name}
                        <button onClick={() => toggleMember(id)} className="hover:text-destructive">
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Member list */}
              <div className="border rounded-xl max-h-60 overflow-y-auto">
                {filteredMembers.map((m) => {
                  const isSelected = selectedMemberIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMember(m.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors ${
                        isSelected ? "bg-primary/5" : ""
                      }`}
                    >
                      <Avatar className="w-8 h-8">
                        {m.photo_url && <AvatarImage src={m.photo_url} alt={m.name} />}
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {m.name?.charAt(0)?.toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate uppercase">{m.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[m.occupation, m.posting_details?.regular_district].filter(Boolean).join(" | ")}
                        </p>
                      </div>
                      {isSelected && (
                        <Check size={16} className="text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
                {filteredMembers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No members found</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingTeam ? "Update Team" : "Create Team"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
