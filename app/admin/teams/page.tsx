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
import { Plus, Pencil, Trash2, UsersRound, Search, X, Check, Crown, Lock, AlertTriangle, Send, MessageCircle } from "lucide-react";
import { toast } from "sonner";

// Normalize a WhatsApp group/chat link so a bare "chat.whatsapp.com/xxx" still opens
function waHref(link: string): string {
  const v = (link || "").trim();
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

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
  is_private: boolean;
  whatsapp_link?: string | null;
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
  const [formIsPrivate, setFormIsPrivate] = useState(false);
  const [formWhatsapp, setFormWhatsapp] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({});
  const [memberSearch, setMemberSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [showOnlyNoLead, setShowOnlyNoLead] = useState(false);
  const [notifying, setNotifying] = useState(false);

  async function notifyLeads() {
    if (!confirm("Send a Telegram message to every current Team Lead with a linked Telegram?\n\nLeads without linked Telegram will be skipped. You (the caller) are skipped.")) return;
    setNotifying(true);
    try {
      const res = await fetch("/api/admin/teams/notify-leads", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const { summary, sent, skipped, failed } = data;
      const lines = [
        `Sent ${summary.sent}, skipped ${summary.skipped}, failed ${summary.failed}.`,
        ...(sent.length ? [`✓ ${sent.join("; ")}`] : []),
        ...(skipped.length ? [`— ${skipped.map((s: { lead: string; reason: string }) => `${s.lead} (${s.reason})`).join("; ")}`] : []),
        ...(failed.length ? [`✗ ${failed.map((f: { lead: string; error: string }) => `${f.lead} (${f.error})`).join("; ")}`] : []),
      ];
      toast.success(lines[0], { description: lines.slice(1).join("\n") });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Notify failed: ${msg}`);
    } finally {
      setNotifying(false);
    }
  }

  const noLeadCount = useMemo(
    () => teams.filter((t) => !t.members.some((m) => m.team_role === "lead")).length,
    [teams],
  );
  const visibleTeams = useMemo(
    () => (showOnlyNoLead ? teams.filter((t) => !t.members.some((m) => m.team_role === "lead")) : teams),
    [teams, showOnlyNoLead],
  );

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
    setFormIsPrivate(false);
    setFormWhatsapp("");
    setSelectedMemberIds([]);
    setMemberRoles({});
    setMemberSearch("");
    setShowDialog(true);
  }

  function openEdit(team: Team) {
    setEditingTeam(team);
    setFormName(team.name);
    setFormDescription(team.description);
    setFormSortOrder(team.sort_order);
    setFormIsPrivate(!!team.is_private);
    setFormWhatsapp(team.whatsapp_link || "");
    setSelectedMemberIds(team.members.map((m) => m.id));
    const roles: Record<string, string> = {};
    team.members.forEach((m) => { if (m.team_role && m.team_role !== "member") roles[m.id] = m.team_role; });
    setMemberRoles(roles);
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
      const members = selectedMemberIds.map((id) => ({ user_id: id, role: memberRoles[id] || "member" }));
      const payload = {
        name: formName.trim(),
        description: formDescription.trim(),
        sort_order: formSortOrder,
        is_private: formIsPrivate,
        whatsapp_link: formWhatsapp.trim(),
        members_with_roles: members,
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
    if (selectedMemberIds.includes(userId)) {
      setMemberRoles((r) => { const next = { ...r }; delete next[userId]; return next; });
      setSelectedMemberIds((prev) => prev.filter((id) => id !== userId));
    } else {
      setSelectedMemberIds((prev) => [...prev, userId]);
    }
  }

  function toggleLead(userId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setMemberRoles((prev) => {
      const next = { ...prev };
      if (next[userId] === "lead") { delete next[userId]; } else { next[userId] = "lead"; }
      return next;
    });
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">Manage Teams</h1>
          {noLeadCount > 0 && (
            <button
              type="button"
              onClick={() => setShowOnlyNoLead((v) => !v)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                showOnlyNoLead
                  ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                  : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
              }`}
              title={showOnlyNoLead ? "Show all teams" : "Show only teams without a lead"}
            >
              <AlertTriangle size={12} />
              {noLeadCount} no-lead{noLeadCount !== 1 ? "s" : ""}
              {showOnlyNoLead && <X size={12} className="ml-0.5" />}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={notifyLeads} variant="outline" className="gap-2" disabled={notifying} title="Send a Telegram designation message to every current Team Lead">
            <Send size={14} />
            {notifying ? "Sending…" : "Telegram leads"}
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} />
            Create Team
          </Button>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <UsersRound className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No teams yet. Create your first team to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {visibleTeams.map((team) => {
            const hasLead = team.members.some((m) => m.team_role === "lead");
            return (
            <Card key={team.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                    <UsersRound size={20} className="text-primary" />
                    {team.name}
                    <Badge variant="outline" className="ml-2 text-xs">
                      {team.members.length} member{team.members.length !== 1 ? "s" : ""}
                    </Badge>
                    {team.is_private && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] gap-1">
                        <Lock size={10} />Private
                      </Badge>
                    )}
                    {!hasLead && team.members.length > 0 && (
                      <Badge
                        className="bg-red-50 text-red-700 border-red-200 text-[10px] gap-1 cursor-pointer hover:bg-red-100"
                        onClick={() => openEdit(team)}
                        title="No Team Lead assigned — click to edit and toggle Crown on a member"
                      >
                        <AlertTriangle size={10} />No Lead
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {team.whatsapp_link && (
                      <Button asChild variant="ghost" size="icon" className="text-green-600 hover:text-green-700">
                        <a href={waHref(team.whatsapp_link)} target="_blank" rel="noopener noreferrer" title="Open WhatsApp group">
                          <MessageCircle size={16} />
                        </a>
                      </Button>
                    )}
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
                    {[...team.members].sort((a, b) => (a.team_role === "lead" ? -1 : b.team_role === "lead" ? 1 : 0)).map((m) => (
                      <div key={m.id} className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${m.team_role === "lead" ? "bg-amber-50 border border-amber-200" : "bg-muted/50"}`}>
                        <Avatar className="w-7 h-7">
                          {m.photo_url && <AvatarImage src={m.photo_url} alt={m.name} />}
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {m.name?.charAt(0)?.toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-medium truncate uppercase">{m.name}</p>
                            {m.team_role === "lead" && <Crown size={12} className="text-amber-600 fill-amber-600 shrink-0" />}
                          </div>
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
            );
          })}
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
              <Label className="flex items-center gap-1.5"><MessageCircle size={14} className="text-green-600" /> WhatsApp Group Link (optional)</Label>
              <Input
                placeholder="https://chat.whatsapp.com/…"
                value={formWhatsapp}
                onChange={(e) => setFormWhatsapp(e.target.value)}
                inputMode="url"
              />
              <p className="text-xs text-muted-foreground">Paste the team&apos;s WhatsApp group invite link. Members see a WhatsApp button on the team card.</p>
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

            <label className="flex items-start gap-3 rounded-xl border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <input
                type="checkbox"
                checked={formIsPrivate}
                onChange={(e) => setFormIsPrivate(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Lock size={14} className="text-amber-600" />
                  Private team (members only)
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Hidden from non-members. Admins and officials can still view it.
                </p>
              </div>
            </label>

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
                    const isLead = memberRoles[id] === "lead";
                    return (
                      <div key={id} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${isLead ? "bg-amber-100 text-amber-800" : "bg-primary/10 text-primary"}`}>
                        <button onClick={(e) => toggleLead(id, e)} title={isLead ? "Remove Team Lead" : "Set as Team Lead"} className="hover:scale-110 transition-transform">
                          <Crown size={12} className={isLead ? "text-amber-600 fill-amber-600" : "text-muted-foreground"} />
                        </button>
                        {m.name}
                        {isLead && <span className="text-[10px] font-semibold text-amber-600">Lead</span>}
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
