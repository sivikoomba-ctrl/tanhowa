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
import { Separator } from "@/components/ui/separator";
import {
  MessageCircle,
  Plus,
  Pencil,
  Trash2,
  Archive,
  Users,
  Crown,
  Search,
  Shield,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface Channel {
  id: string;
  name: string;
  description: string;
  icon: string;
  is_default: boolean;
  archived: boolean;
  member_count: number;
  message_count: number;
  created_by: string;
  creator_name?: string;
  created_at: string;
}

interface ChannelMember {
  id: string;
  user_id: string;
  name: string;
  photo_url: string;
  occupation: string;
  role: string; // member or admin
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  photo_url: string;
  occupation: string;
}

export default function AdminGroupChatPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  // Expanded channel state
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);
  const [channelMembers, setChannelMembers] = useState<ChannelMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Add member search
  const [allUsers, setAllUsers] = useState<UserItem[]>([]);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  // Delete confirm
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  async function fetchChannels() {
    try {
      const res = await fetch("/api/chat/channels");
      const data = await res.json();
      setChannels(data.channels || []);
    } catch {
      toast.error("Failed to load channels");
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsers() {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setAllUsers(data.users || []);
    } catch {
      // silent
    }
  }

  useEffect(() => {
    fetchChannels();
    fetchUsers();
  }, []);

  async function fetchMembers(channelId: string) {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/chat/members?channel=${channelId}`);
      const data = await res.json();
      setChannelMembers(data.members || []);
    } catch {
      toast.error("Failed to load members");
    } finally {
      setMembersLoading(false);
    }
  }

  function toggleExpand(channelId: string) {
    if (expandedChannelId === channelId) {
      setExpandedChannelId(null);
      setChannelMembers([]);
      setAddMemberSearch("");
    } else {
      setExpandedChannelId(channelId);
      fetchMembers(channelId);
      setAddMemberSearch("");
    }
  }

  function openCreate() {
    setEditingChannel(null);
    setFormName("");
    setFormDescription("");
    setFormIsDefault(false);
    setShowDialog(true);
  }

  function openEdit(channel: Channel) {
    setEditingChannel(channel);
    setFormName(channel.name);
    setFormDescription(channel.description || "");
    setFormIsDefault(channel.is_default);
    setShowDialog(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error("Channel name is required");
      return;
    }

    setSaving(true);
    try {
      if (editingChannel) {
        const res = await fetch("/api/chat/channels", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingChannel.id,
            name: formName.trim(),
            description: formDescription.trim(),
            archived: editingChannel.archived,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to update");
        }
        toast.success("Channel updated");
      } else {
        const res = await fetch("/api/chat/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim(),
            icon: "MessageCircle",
            isDefault: formIsDefault,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create");
        }
        toast.success("Channel created");
      }
      setShowDialog(false);
      fetchChannels();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save channel");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle(channel: Channel) {
    try {
      const res = await fetch("/api/chat/channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: channel.id,
          name: channel.name,
          description: channel.description,
          archived: !channel.archived,
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success(channel.archived ? "Channel unarchived" : "Channel archived");
      fetchChannels();
    } catch {
      toast.error("Failed to update channel");
    }
  }

  async function handleDelete(channelId: string) {
    try {
      const res = await fetch("/api/chat/channels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: channelId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
      toast.success("Channel deleted");
      setDeleteConfirmId(null);
      if (expandedChannelId === channelId) {
        setExpandedChannelId(null);
        setChannelMembers([]);
      }
      fetchChannels();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete channel");
    }
  }

  async function handleRemoveMember(channelId: string, userId: string) {
    try {
      const res = await fetch("/api/chat/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, action: "remove", userId }),
      });
      if (!res.ok) throw new Error("Failed to remove member");
      toast.success("Member removed");
      fetchMembers(channelId);
      fetchChannels();
    } catch {
      toast.error("Failed to remove member");
    }
  }

  async function handleAddMember(channelId: string, userId: string) {
    setAddingMember(true);
    try {
      const res = await fetch("/api/chat/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, action: "add", userId }),
      });
      if (!res.ok) throw new Error("Failed to add member");
      toast.success("Member added");
      setAddMemberSearch("");
      fetchMembers(channelId);
      fetchChannels();
    } catch {
      toast.error("Failed to add member");
    } finally {
      setAddingMember(false);
    }
  }

  async function handleToggleAdmin(channelId: string, userId: string, currentRole: string) {
    const newRole = currentRole === "admin" ? "member" : "admin";
    try {
      const res = await fetch("/api/chat/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, action: "set_role", userId, role: newRole }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      toast.success(newRole === "admin" ? "Made channel admin" : "Removed admin role");
      fetchMembers(channelId);
    } catch {
      toast.error("Failed to update member role");
    }
  }

  const existingMemberIds = useMemo(
    () => new Set(channelMembers.map((m) => m.user_id)),
    [channelMembers]
  );

  const filteredAddUsers = useMemo(() => {
    if (!addMemberSearch.trim()) return [];
    const q = addMemberSearch.toLowerCase();
    return allUsers
      .filter(
        (u) =>
          !existingMemberIds.has(u.id) &&
          (u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [allUsers, addMemberSearch, existingMemberIds]);

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
        <h1 className="text-2xl font-bold">Manage Group Chats</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus size={16} />
          Create Channel
        </Button>
      </div>

      {channels.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No group chat channels yet. Create your first channel to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {channels.map((channel) => {
            const isExpanded = expandedChannelId === channel.id;
            return (
              <Card key={channel.id} className={channel.archived ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => toggleExpand(channel.id)}
                      className="flex items-center gap-2 text-left"
                    >
                      <CardTitle className="text-lg flex items-center gap-2">
                        <MessageCircle size={20} className="text-primary" />
                        {channel.name}
                        {channel.is_default && (
                          <Badge variant="secondary" className="text-[10px]">
                            Default
                          </Badge>
                        )}
                        {channel.archived && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                            Archived
                          </Badge>
                        )}
                      </CardTitle>
                      {isExpanded ? (
                        <ChevronUp size={16} className="text-muted-foreground" />
                      ) : (
                        <ChevronDown size={16} className="text-muted-foreground" />
                      )}
                    </button>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleArchiveToggle(channel)}
                        title={channel.archived ? "Unarchive" : "Archive"}
                      >
                        <Archive
                          size={16}
                          className={channel.archived ? "text-green-600" : "text-muted-foreground"}
                        />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(channel)}>
                        <Pencil size={16} />
                      </Button>
                      {!channel.is_default && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirmId(channel.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                  {channel.description && (
                    <p className="text-sm text-muted-foreground mt-1">{channel.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {channel.member_count} member{channel.member_count !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle size={12} />
                      {channel.message_count} message{channel.message_count !== 1 ? "s" : ""}
                    </span>
                    {channel.creator_name && (
                      <span>Created by {channel.creator_name}</span>
                    )}
                    <span>
                      {new Date(channel.created_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent>
                    <Separator className="mb-4" />

                    {/* Add member search */}
                    <div className="mb-4">
                      <Label className="text-sm font-medium mb-2 block">Add Member</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search users by name..."
                          value={addMemberSearch}
                          onChange={(e) => setAddMemberSearch(e.target.value)}
                          className="pl-9"
                          disabled={addingMember}
                        />
                      </div>
                      {filteredAddUsers.length > 0 && (
                        <div className="border rounded-xl mt-1 max-h-48 overflow-y-auto">
                          {filteredAddUsers.map((u) => (
                            <button
                              key={u.id}
                              onClick={() => handleAddMember(channel.id, u.id)}
                              disabled={addingMember}
                              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                            >
                              <Avatar className="w-7 h-7">
                                {u.photo_url && <AvatarImage src={u.photo_url} alt={u.name} />}
                                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                  {u.name?.charAt(0)?.toUpperCase() || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate uppercase">{u.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{u.occupation}</p>
                              </div>
                              <Plus size={14} className="text-primary shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Members list */}
                    <Label className="text-sm font-medium mb-2 block">
                      Channel Members ({channelMembers.length})
                    </Label>
                    {membersLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : channelMembers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No members in this channel yet.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {channelMembers.map((m) => (
                          <div
                            key={m.id}
                            className={`flex items-center gap-3 px-3 py-2 rounded-xl ${
                              m.role === "admin" ? "bg-amber-50 border border-amber-200" : "bg-muted/30"
                            }`}
                          >
                            <Avatar className="w-8 h-8">
                              {m.photo_url && <AvatarImage src={m.photo_url} alt={m.name} />}
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {m.name?.charAt(0)?.toUpperCase() || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium truncate uppercase">{m.name}</p>
                                {m.role === "admin" && (
                                  <Crown size={12} className="text-amber-600 fill-amber-600 shrink-0" />
                                )}
                              </div>
                              {m.occupation && (
                                <p className="text-xs text-muted-foreground truncate">{m.occupation}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() =>
                                  handleToggleAdmin(channel.id, m.user_id, m.role)
                                }
                                title={m.role === "admin" ? "Remove admin" : "Make admin"}
                              >
                                <Shield
                                  size={14}
                                  className={
                                    m.role === "admin"
                                      ? "text-amber-600"
                                      : "text-muted-foreground"
                                  }
                                />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleRemoveMember(channel.id, m.user_id)}
                                title="Remove from channel"
                              >
                                <X size={14} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Channel Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingChannel ? "Edit Channel" : "Create Channel"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Channel Name</Label>
              <Input
                placeholder="e.g. General Discussion"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Brief description of this channel's purpose..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
              />
            </div>

            {!editingChannel && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formIsDefault}
                  onChange={(e) => setFormIsDefault(e.target.checked)}
                  className="rounded border-input"
                />
                <Label htmlFor="isDefault" className="text-sm font-normal cursor-pointer">
                  Default channel (all new members auto-join)
                </Label>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingChannel ? "Update Channel" : "Create Channel"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Channel?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete this channel and all its messages. This action cannot be
            undone.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
