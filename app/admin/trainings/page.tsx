"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  GraduationCap, Plus, Trash2, Calendar, MapPin, Clock, Users,
  Video, Building, Pencil, UserCheck, Loader2, ExternalLink, QrCode,
  Search, Send, Check, X, Mail, Upload, FileText, Globe, Lock, Eye,
} from "lucide-react";
import QRCode from "qrcode";
import { formatDate } from "@/lib/utils";

interface Training {
  id: string;
  title: string;
  description: string;
  topic: string;
  trainer_name: string;
  trainer_email: string;
  trainer_phone: string;
  trainer_type: string;
  date: string | null;
  duration_hours: number;
  location: string;
  mode: string;
  meeting_link: string;
  max_participants: number;
  status: string;
  materials_url: string;
  enrolled_count: number;
  created_at: string;
}

const TOPICS = ["Horticulture", "Pest Management", "Organic Farming", "Soil Health", "Post-Harvest", "Marketing", "Technology", "Legal", "Administration", "Other"];

const statusConfig: Record<string, { label: string; color: string }> = {
  upcoming: { label: "Upcoming", color: "bg-blue-100 text-blue-700 border-blue-300" },
  ongoing: { label: "Ongoing", color: "bg-green-100 text-green-700 border-green-300" },
  completed: { label: "Completed", color: "bg-gray-100 text-gray-700 border-gray-300" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700 border-red-300" },
};

const emptyForm = {
  title: "", description: "", topic: "", trainer_name: "", trainer_email: "", trainer_phone: "",
  trainer_type: "member", date: "", duration_hours: "1", location: "", mode: "offline",
  meeting_link: "", max_participants: "0", materials_url: "",
};

export default function AdminTrainingsPage() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [tab, setTab] = useState("upcoming");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTraining, setEditTraining] = useState<Training | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrTitle, setQrTitle] = useState("");
  const [inviteMode, setInviteMode] = useState<"manual" | "member" | "external">("manual");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<{ id: string; name: string; photo_url: string; occupation: string }[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{ name: string; status: string } | null>(null);
  // Materials
  const [materialsTraining, setMaterialsTraining] = useState<Training | null>(null);
  const [materials, setMaterials] = useState<{ id: string; title: string; file_name: string; file_type: string; file_size: number; language: string; access: string; group_id: string | null; signed_url: string; created_at: string }[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [matTitle, setMatTitle] = useState("");
  const [matLang, setMatLang] = useState("en");
  const [matAccess, setMatAccess] = useState("enrolled");
  const matFileRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    fetch(`/api/trainings?status=${tab}`)
      .then((r) => r.json())
      .then((d) => setTrainings(d.trainings || []))
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [tab]);

  function openEdit(t: Training) {
    setForm({
      title: t.title, description: t.description, topic: t.topic,
      trainer_name: t.trainer_name, trainer_email: t.trainer_email, trainer_phone: t.trainer_phone,
      trainer_type: t.trainer_type, date: t.date ? t.date.slice(0, 16) : "",
      duration_hours: String(t.duration_hours), location: t.location, mode: t.mode,
      meeting_link: t.meeting_link, max_participants: String(t.max_participants), materials_url: t.materials_url,
    });
    setEditTraining(t);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.trainer_name.trim()) {
      toast.error("Title and trainer name are required");
      return;
    }
    setSaving(true);

    const payload = {
      ...form,
      duration_hours: parseFloat(form.duration_hours) || 1,
      max_participants: parseInt(form.max_participants) || 0,
      date: form.date || null,
      ...(editTraining ? { id: editTraining.id } : {}),
    };

    const res = await fetch("/api/trainings", {
      method: editTraining ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(editTraining ? "Updated" : "Training created");
      setCreateOpen(false);
      setEditTraining(null);
      setForm(emptyForm);
      load();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error || "Failed to save");
    }
    setSaving(false);
  }

  async function handleStatusChange(id: string, status: string) {
    const res = await fetch("/api/trainings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) { toast.success("Status updated"); load(); }
    else toast.error("Failed to update status");
  }

  async function showQR(id: string, title: string) {
    const checkinUrl = `${window.location.origin}/dashboard/trainings?checkin=${id}`;
    const dataUrl = await QRCode.toDataURL(checkinUrl, { width: 300, margin: 2 });
    setQrUrl(dataUrl);
    setQrTitle(title);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this training?")) return;
    const res = await fetch(`/api/trainings?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted"); load(); }
    else toast.error("Failed to delete");
  }

  // Member search for trainer invite
  useEffect(() => {
    if (inviteMode !== "member" || !memberSearch.trim() || memberSearch.trim().length < 2) {
      setMemberResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearchingMembers(true);
      try {
        const res = await fetch(`/api/users?search=${encodeURIComponent(memberSearch.trim())}&limit=8`);
        const data = await res.json();
        setMemberResults(data.users || []);
      } catch { setMemberResults([]); }
      setSearchingMembers(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [memberSearch, inviteMode]);

  async function sendTrainerInvite(trainingId: string, userId?: string) {
    setSendingInvite(true);
    try {
      const payload: Record<string, string> = { training_id: trainingId, message: inviteMessage };
      if (userId) {
        payload.user_id = userId;
      } else {
        payload.external_name = form.trainer_name;
        payload.external_email = form.trainer_email;
        payload.external_phone = form.trainer_phone;
      }
      const res = await fetch("/api/trainings/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Trainer invite sent!");
        setInviteMessage("");
        setMemberSearch("");
      } else {
        toast.error(data.error || "Failed to send invite");
      }
    } catch { toast.error("Failed to send invite"); }
    setSendingInvite(false);
  }

  const LANG_LABELS: Record<string, string> = { en: "English", ta: "தமிழ்", kn: "ಕನ್ನಡ", te: "తెలుగు" };
  const LANG_COLORS: Record<string, string> = { en: "bg-blue-100 text-blue-700", ta: "bg-green-100 text-green-700", kn: "bg-purple-100 text-purple-700", te: "bg-orange-100 text-orange-700" };

  async function openMaterials(t: Training) {
    setMaterialsTraining(t);
    setMaterialsLoading(true);
    try {
      const res = await fetch(`/api/trainings/materials?training_id=${t.id}`);
      const data = await res.json();
      setMaterials(data.materials || []);
    } catch { setMaterials([]); }
    setMaterialsLoading(false);
  }

  async function uploadMaterial() {
    const file = matFileRef.current?.files?.[0];
    if (!file || !matTitle.trim() || !materialsTraining) return;
    setUploadingMaterial(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("training_id", materialsTraining.id);
      fd.append("title", matTitle.trim());
      fd.append("language", matLang);
      fd.append("access", matAccess);
      const res = await fetch("/api/trainings/materials", { method: "POST", body: fd });
      if (res.ok) {
        toast.success("Material uploaded");
        setMatTitle(""); setMatLang("en"); setMatAccess("enrolled");
        if (matFileRef.current) matFileRef.current.value = "";
        openMaterials(materialsTraining);
      } else {
        const data = await res.json();
        toast.error(data.error || "Upload failed");
      }
    } catch { toast.error("Upload failed"); }
    setUploadingMaterial(false);
  }

  async function deleteMaterial(id: string) {
    if (!confirm("Delete this material?")) return;
    const res = await fetch(`/api/trainings/materials?id=${id}`, { method: "DELETE" });
    if (res.ok && materialsTraining) { toast.success("Deleted"); openMaterials(materialsTraining); }
    else toast.error("Failed to delete");
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  const modeIcons: Record<string, typeof Video> = { online: Video, offline: Building, hybrid: ExternalLink };

  const formUI = (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <Label>Title *</Label>
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Training session title" required className="mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Topic</Label>
          <Select value={form.topic} onValueChange={(v) => setForm({ ...form, topic: v })}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select topic" /></SelectTrigger>
            <SelectContent>{TOPICS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Mode</Label>
          <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1" />
      </div>
      {/* Trainer Section */}
      <div className="space-y-2">
        <Label>Trainer</Label>
        <div className="flex gap-1">
          {(["manual", "member", "external"] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setInviteMode(m); setMemberSearch(""); setMemberResults([]); }}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${inviteMode === m ? "bg-primary text-white" : "bg-muted hover:bg-muted/80"}`}>
              {m === "manual" ? "Manual" : m === "member" ? "Invite Member" : "Invite External"}
            </button>
          ))}
        </div>

        {inviteMode === "manual" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Trainer Name *</Label>
                <Input value={form.trainer_name} onChange={(e) => setForm({ ...form, trainer_name: e.target.value })} required className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={form.trainer_type} onValueChange={(v) => setForm({ ...form, trainer_type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="external">External</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" value={form.trainer_email} onChange={(e) => setForm({ ...form, trainer_email: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={form.trainer_phone} onChange={(e) => setForm({ ...form, trainer_phone: e.target.value })} className="mt-1" />
              </div>
            </div>
          </>
        )}

        {inviteMode === "member" && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search member by name..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} className="pl-9" />
            </div>
            {searchingMembers && <p className="text-xs text-muted-foreground">Searching...</p>}
            {memberResults.length > 0 && (
              <div className="border rounded-xl max-h-48 overflow-y-auto">
                {memberResults.map((m) => (
                  <button key={m.id} type="button" onClick={() => {
                    setForm({ ...form, trainer_name: m.name, trainer_type: "member" });
                    setMemberSearch("");
                    setMemberResults([]);
                    if (editTraining) {
                      sendTrainerInvite(editTraining.id, m.id);
                    } else {
                      setInviteStatus({ name: m.name, status: "Will be invited after creating" });
                      toast.info(`${m.name} will be invited after training is created`);
                    }
                  }} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50">
                    <Avatar className="w-8 h-8">
                      {m.photo_url && <AvatarImage src={m.photo_url} alt={m.name} />}
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">{m.name?.charAt(0)?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.occupation}</p>
                    </div>
                    <Send size={14} className="text-primary shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {inviteStatus && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50 border border-green-200">
                <Check size={14} className="text-green-600" />
                <span className="text-xs text-green-700">{inviteStatus.name}: {inviteStatus.status}</span>
              </div>
            )}
            <div>
              <Label className="text-xs">Invite Message (optional)</Label>
              <Input value={inviteMessage} onChange={(e) => setInviteMessage(e.target.value)} placeholder="Personal message for the trainer..." className="mt-1" />
            </div>
          </div>
        )}

        {inviteMode === "external" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name *</Label>
                <Input value={form.trainer_name} onChange={(e) => setForm({ ...form, trainer_name: e.target.value })} required className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Email *</Label>
                <Input type="email" value={form.trainer_email} onChange={(e) => setForm({ ...form, trainer_email: e.target.value })} required className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={form.trainer_phone} onChange={(e) => setForm({ ...form, trainer_phone: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Invite Message (optional)</Label>
              <Input value={inviteMessage} onChange={(e) => setInviteMessage(e.target.value)} placeholder="Personal message for the trainer..." className="mt-1" />
            </div>
            {editTraining && (
              <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={sendingInvite || !form.trainer_email}
                onClick={() => sendTrainerInvite(editTraining.id)}>
                {sendingInvite ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                Send Email Invite
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Date & Time</Label>
          <Input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label>Duration (hours)</Label>
          <Input type="number" step="0.5" value={form.duration_hours} onChange={(e) => setForm({ ...form, duration_hours: e.target.value })} className="mt-1" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Location</Label>
          <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label>Max Participants (0 = unlimited)</Label>
          <Input type="number" value={form.max_participants} onChange={(e) => setForm({ ...form, max_participants: e.target.value })} className="mt-1" />
        </div>
      </div>
      {form.mode !== "offline" && (
        <div>
          <Label>Meeting Link</Label>
          <Input value={form.meeting_link} onChange={(e) => setForm({ ...form, meeting_link: e.target.value })} placeholder="https://meet.google.com/..." className="mt-1" />
        </div>
      )}
      <div>
        <Label>Materials URL</Label>
        <Input value={form.materials_url} onChange={(e) => setForm({ ...form, materials_url: e.target.value })} placeholder="Link to training materials" className="mt-1" />
      </div>
      <Button type="submit" disabled={saving} className="w-full bg-primary hover:bg-primary/90">
        {saving ? "Saving..." : editTraining ? "Update Training" : "Create Training"}
      </Button>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <GraduationCap size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Trainings</h1>
            <p className="text-sm text-muted-foreground">Manage training sessions for members</p>
          </div>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setForm(emptyForm); setEditTraining(null); } }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90"><Plus size={16} className="mr-1" />Create</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editTraining ? "Edit Training" : "Create Training"}</DialogTitle></DialogHeader>
            {formUI}
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editTraining} onOpenChange={(v) => { if (!v) { setEditTraining(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Training</DialogTitle></DialogHeader>
          {formUI}
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="ongoing">Ongoing</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : trainings.length === 0 ? (
            <div className="text-center py-12">
              <GraduationCap className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No trainings found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trainings.map((t) => {
                const config = statusConfig[t.status] || statusConfig.upcoming;
                const ModeIcon = modeIcons[t.mode] || Building;
                return (
                  <Card key={t.id}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold">{t.title}</h3>
                            <Badge variant="outline" className={config.color}>{config.label}</Badge>
                            {t.topic && <Badge variant="outline" className="text-xs">{t.topic}</Badge>}
                            <Badge variant="outline" className="text-xs"><ModeIcon size={10} className="mr-0.5" />{t.mode}</Badge>
                          </div>
                          {t.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><UserCheck size={12} />{t.trainer_name} ({t.trainer_type})</span>
                            {t.date && <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(t.date)}</span>}
                            {t.duration_hours > 0 && <span className="flex items-center gap-1"><Clock size={12} />{t.duration_hours}h</span>}
                            {t.location && <span className="flex items-center gap-1"><MapPin size={12} />{t.location}</span>}
                            <span className="flex items-center gap-1">
                              <Users size={12} />{t.enrolled_count}{t.max_participants > 0 ? `/${t.max_participants}` : ""} enrolled
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {t.status === "upcoming" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusChange(t.id, "ongoing")}>Start</Button>
                          )}
                          {t.status === "ongoing" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusChange(t.id, "completed")}>Complete</Button>
                          )}
                          {(t.status === "upcoming" || t.status === "ongoing") && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="QR Check-in" onClick={() => showQR(t.id, t.title)}>
                              <QrCode size={14} />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Materials" onClick={() => openMaterials(t)}>
                            <FileText size={14} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { openEdit(t); }}>
                            <Pencil size={14} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(t.id)}>
                            <Trash2 size={14} />
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
      </Tabs>

      {/* Materials Dialog */}
      <Dialog open={!!materialsTraining} onOpenChange={(v) => { if (!v) setMaterialsTraining(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={18} className="text-primary" />
              Materials: {materialsTraining?.title}
            </DialogTitle>
          </DialogHeader>

          {/* Upload Form */}
          <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
            <p className="text-sm font-medium">Upload Material</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Title *</Label>
                <Input value={matTitle} onChange={(e) => setMatTitle(e.target.value)} placeholder="e.g. Session Notes" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Language</Label>
                <Select value={matLang} onValueChange={setMatLang}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ta">Tamil (தமிழ்)</SelectItem>
                    <SelectItem value="kn">Kannada (ಕನ್ನಡ)</SelectItem>
                    <SelectItem value="te">Telugu (తెలుగు)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Access</Label>
                <Select value={matAccess} onValueChange={setMatAccess}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Members</SelectItem>
                    <SelectItem value="enrolled">Enrolled Only</SelectItem>
                    <SelectItem value="selected">Selected Members</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">File *</Label>
                <Input type="file" ref={matFileRef} className="mt-1" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.mp4,.webm,.txt" />
              </div>
            </div>
            <Button size="sm" onClick={uploadMaterial} disabled={uploadingMaterial || !matTitle.trim()} className="gap-1.5">
              {uploadingMaterial ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploadingMaterial ? "Uploading..." : "Upload"}
            </Button>
          </div>

          {/* Materials List */}
          {materialsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : materials.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">No materials uploaded yet</p>
          ) : (
            <div className="space-y-2">
              {materials.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/30 transition-colors">
                  <FileText size={16} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{m.title}</p>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${LANG_COLORS[m.language] || ""}`}>
                        {LANG_LABELS[m.language] || m.language}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {m.access === "all" ? <><Globe size={8} className="mr-0.5" />All</> : m.access === "enrolled" ? <><Eye size={8} className="mr-0.5" />Enrolled</> : <><Lock size={8} className="mr-0.5" />Selected</>}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{m.file_name} · {formatSize(m.file_size)}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {m.signed_url && (
                      <a href={m.signed_url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><ExternalLink size={14} /></Button>
                      </a>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteMaterial(m.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={!!qrUrl} onOpenChange={(v) => { if (!v) { setQrUrl(null); setQrTitle(""); } }}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="text-center text-sm">QR Check-in</DialogTitle></DialogHeader>
          <div className="text-center space-y-3">
            <p className="text-sm font-medium">{qrTitle}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qrUrl && <img src={qrUrl} alt="QR Code" className="mx-auto rounded-lg" />}
            <p className="text-xs text-muted-foreground">Members scan this QR code to mark attendance</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
