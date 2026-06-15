"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, ArrowLeft, Trash2, CalendarDays, MapPin, Video, Users, ListChecks, FileText,
  CheckCircle2, Loader2, FileDown, Lock, UserPlus, X, Pencil,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Meeting {
  id: string;
  title: string;
  type: string;
  description: string;
  scheduled_at: string | null;
  location: string;
  mode: string;
  meeting_link: string;
  status: string;
  quorum_required: number | null;
  minutes: string;
  minutes_finalized: boolean;
  agendaCount?: number;
  attendanceCount?: number;
}
interface AgendaItem { id: string; title: string; description: string; status: string; order_index: number; presenter: string | null; }
interface Attendee { id: string; user_id: string; rsvp: string | null; attended: boolean; role_at_meeting: string | null; user?: { name: string; email: string } | null; }
interface Member { id: string; name: string; email: string; }

const TYPE_LABEL: Record<string, string> = { agm: "AGM", committee: "Committee", ec: "Executive", general: "General Body", special: "Special" };
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700", scheduled: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700", completed: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
};
const blankForm = { title: "", type: "committee", description: "", scheduled_at: "", location: "", mode: "in_person", meeting_link: "", quorum_required: "" };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Not scheduled");
const toLocalInput = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); const off = d.getTimezoneOffset(); return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16); };

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/meetings");
      if (res.status === 403) { setForbidden(true); return; }
      const d = await res.json();
      setMeetings(d.meetings || []);
    } catch { toast.error("Failed to load meetings"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  async function saveMeeting() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title, type: form.type, description: form.description,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        location: form.location, mode: form.mode, meeting_link: form.meeting_link,
        quorum_required: form.quorum_required ? Number(form.quorum_required) : null,
      };
      const res = await fetch("/api/admin/meetings", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? { id: editId, ...payload } : payload),
      });
      if (!res.ok) { toast.error("Save failed"); return; }
      toast.success(editId ? "Meeting updated" : "Meeting created");
      setCreateOpen(false); setEditId(null); setForm(blankForm);
      loadList();
    } finally { setSaving(false); }
  }

  function openEdit(m: Meeting) {
    setEditId(m.id);
    setForm({ title: m.title, type: m.type, description: m.description || "", scheduled_at: toLocalInput(m.scheduled_at), location: m.location || "", mode: m.mode, meeting_link: m.meeting_link || "", quorum_required: m.quorum_required ? String(m.quorum_required) : "" });
    setCreateOpen(true);
  }
  async function delMeeting(id: string) {
    if (!confirm("Delete this meeting and its agenda/attendance? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/meetings?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Meeting deleted"); loadList(); } else toast.error("Delete failed");
  }

  if (loading) return <div className="flex justify-center h-64 items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (forbidden) return (
    <div className="max-w-2xl mx-auto p-6"><Card><CardContent className="p-8 text-center">
      <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
      <h2 className="text-xl font-semibold mb-2">Restricted</h2>
      <p className="text-sm text-muted-foreground">Meetings are managed by super-admins and state officials.</p>
    </CardContent></Card></div>
  );

  if (selectedId) return <MeetingDetail id={selectedId} onBack={() => { setSelectedId(null); loadList(); }} onEdit={(m) => { setEditId(m.id); setForm({ title: m.title, type: m.type, description: m.description || "", scheduled_at: toLocalInput(m.scheduled_at), location: m.location || "", mode: m.mode, meeting_link: m.meeting_link || "", quorum_required: m.quorum_required ? String(m.quorum_required) : "" }); setCreateOpen(true); }} createDialog={createDialog()} />;

  function createDialog() {
    return (
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setEditId(null); setForm(blankForm); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit Meeting" : "New Meeting"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Mode</Label>
                <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="in_person">In person</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Date & time</Label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div><Label>Quorum required</Label><Input type="number" min="0" value={form.quorum_required} onChange={(e) => setForm({ ...form, quorum_required: e.target.value })} /></div>
            </div>
            {form.mode !== "in_person" && <div><Label>Meeting link</Label><Input value={form.meeting_link} onChange={(e) => setForm({ ...form, meeting_link: e.target.value })} /></div>}
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button onClick={saveMeeting} disabled={saving} className="w-full">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editId ? "Save changes" : "Create meeting")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarDays className="w-6 h-6 text-primary" /> Meetings & AGM</h1>
          <p className="text-sm text-muted-foreground mt-1">Schedule meetings, manage agenda, track quorum, and record minutes.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setEditId(null); setForm(blankForm); } }}>
          <DialogTrigger asChild><Button><Plus size={16} className="mr-1" /> New Meeting</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? "Edit Meeting" : "New Meeting"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Mode</Label>
                  <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="in_person">In person</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Date & time</Label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
                <div><Label>Quorum required</Label><Input type="number" min="0" value={form.quorum_required} onChange={(e) => setForm({ ...form, quorum_required: e.target.value })} /></div>
              </div>
              {form.mode !== "in_person" && <div><Label>Meeting link</Label><Input value={form.meeting_link} onChange={(e) => setForm({ ...form, meeting_link: e.target.value })} /></div>}
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button onClick={saveMeeting} disabled={saving} className="w-full">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editId ? "Save changes" : "Create meeting")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {meetings.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No meetings yet. Create one to get started.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <Card key={m.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedId(m.id)}>
              <CardContent className="pt-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{m.title}</h3>
                    <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[m.type] || m.type}</Badge>
                    <Badge className={`text-[10px] ${STATUS_COLOR[m.status] || ""}`}>{m.status}</Badge>
                    {m.minutes_finalized && <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">Minutes finalized</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1"><CalendarDays size={12} /> {fmt(m.scheduled_at)}</span>
                    {m.location && <span className="flex items-center gap-1"><MapPin size={12} /> {m.location}</span>}
                    <span className="flex items-center gap-1"><ListChecks size={12} /> {m.agendaCount} agenda</span>
                    <span className="flex items-center gap-1"><Users size={12} /> {m.attendanceCount} attendees</span>
                  </p>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Edit meeting" onClick={() => openEdit(m)}><Pencil size={15} /></Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600" title="Delete meeting" onClick={() => delMeeting(m.id)}><Trash2 size={15} /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingDetail({ id, onBack, onEdit, createDialog }: { id: string; onBack: () => void; onEdit: (m: Meeting) => void; createDialog: React.ReactNode }) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [attendance, setAttendance] = useState<Attendee[]>([]);
  const [summary, setSummary] = useState<{ attendedCount: number; rsvpYes: number; invited: number; quorumRequired: number | null; quorumMet: boolean | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [newAgenda, setNewAgenda] = useState("");
  const [minutes, setMinutes] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [memberSearch, setMemberSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/meetings?id=${id}`);
      const d = await res.json();
      setMeeting(d.meeting); setAgenda(d.agenda || []); setAttendance(d.attendance || []); setSummary(d.summary);
      setMinutes(d.meeting?.minutes || "");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch("/api/users?status=approved").then((r) => r.json()).then((d) => setMembers((d.users || []).map((u: Member) => ({ id: u.id, name: u.name, email: u.email })))).catch(() => {}); }, []);

  async function setStatus(status: string) { await fetch("/api/admin/meetings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }); load(); }
  async function addAgenda() {
    if (!newAgenda.trim()) return;
    await fetch("/api/admin/meetings/agenda", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: id, title: newAgenda }) });
    setNewAgenda(""); load();
  }
  async function setAgendaStatus(itemId: string, status: string) { await fetch("/api/admin/meetings/agenda", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: itemId, status }) }); load(); }
  async function delAgenda(itemId: string) { await fetch(`/api/admin/meetings/agenda?id=${itemId}`, { method: "DELETE" }); load(); }
  async function addAttendee(userId: string) { await fetch("/api/admin/meetings/attendance", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: id, userId, attended: true }) }); setMemberSearch(""); load(); }
  async function toggleAttended(a: Attendee) { await fetch("/api/admin/meetings/attendance", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: id, userId: a.user_id, attended: !a.attended }) }); load(); }
  async function removeAttendee(rowId: string) { await fetch(`/api/admin/meetings/attendance?id=${rowId}`, { method: "DELETE" }); load(); }
  async function saveMinutes(finalize?: boolean) {
    await fetch("/api/admin/meetings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, minutes, ...(finalize !== undefined ? { minutes_finalized: finalize } : {}) }) });
    toast.success(finalize ? "Minutes finalized" : "Minutes saved"); load();
  }
  async function deleteMeeting() { if (!confirm("Delete this meeting and its agenda/attendance?")) return; await fetch(`/api/admin/meetings?id=${id}`, { method: "DELETE" }); onBack(); }

  function exportPdf() {
    if (!meeting) return;
    const doc = new jsPDF();
    doc.setFontSize(15); doc.text(`TANHOWA — ${meeting.title}`, 14, 16);
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`${TYPE_LABEL[meeting.type] || meeting.type}  |  ${fmt(meeting.scheduled_at)}${meeting.location ? "  |  " + meeting.location : ""}`, 14, 23);
    doc.setTextColor(0);
    let y = 30;
    if (agenda.length) {
      autoTable(doc, { startY: y, head: [["#", "Agenda Item", "Status"]], body: agenda.map((a, i) => [i + 1, a.title, a.status]), theme: "grid", headStyles: { fillColor: [45, 106, 79], fontSize: 9 }, bodyStyles: { fontSize: 8 }, margin: { left: 14 } });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
    const present = attendance.filter((a) => a.attended);
    if (present.length) {
      autoTable(doc, { startY: y, head: [["#", "Attendee", "Role"]], body: present.map((a, i) => [i + 1, a.user?.name || "—", a.role_at_meeting || "Member"]), theme: "grid", headStyles: { fillColor: [45, 106, 79], fontSize: 9 }, bodyStyles: { fontSize: 8 }, margin: { left: 14 } });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
    doc.setFontSize(12); doc.text("Minutes", 14, y); y += 6;
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(meeting.minutes || "—", 180), 14, y);
    doc.save(`Minutes-${meeting.title.replace(/\s+/g, "-")}.pdf`);
  }

  if (loading || !meeting) return <div className="flex justify-center h-64 items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const filteredMembers = memberSearch.trim()
    ? members.filter((m) => !attendance.some((a) => a.user_id === m.id) && (m.name?.toLowerCase().includes(memberSearch.toLowerCase()) || m.email?.toLowerCase().includes(memberSearch.toLowerCase()))).slice(0, 8)
    : [];

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-5">
      {createDialog}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={16} className="mr-1" /> Back</Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(meeting)}>Edit</Button>
          <Button variant="outline" size="sm" onClick={exportPdf}><FileDown size={14} className="mr-1" /> Minutes PDF</Button>
          <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={deleteMeeting}><Trash2 size={14} /></Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle>{meeting.title}</CardTitle>
            <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[meeting.type] || meeting.type}</Badge>
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap mt-1">
            <span className="flex items-center gap-1"><CalendarDays size={13} /> {fmt(meeting.scheduled_at)}</span>
            {meeting.location && <span className="flex items-center gap-1"><MapPin size={13} /> {meeting.location}</span>}
            {meeting.mode !== "in_person" && meeting.meeting_link && <a href={meeting.meeting_link} target="_blank" className="flex items-center gap-1 text-primary"><Video size={13} /> Join link</a>}
          </p>
        </CardHeader>
        <CardContent className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Status</Label>
            <Select value={meeting.status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{["draft", "scheduled", "in_progress", "completed", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {summary && summary.quorumRequired != null && (
            <Badge className={summary.quorumMet ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>
              Quorum {summary.attendedCount}/{summary.quorumRequired} {summary.quorumMet ? "✓ met" : "not met"}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Agenda */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ListChecks size={18} /> Agenda</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {agenda.length === 0 && <p className="text-sm text-muted-foreground">No agenda items yet.</p>}
          {agenda.map((a, i) => (
            <div key={a.id} className="flex items-center gap-2 border-b py-2">
              <span className="text-sm text-muted-foreground w-5">{i + 1}.</span>
              <span className="flex-1 text-sm">{a.title}</span>
              <Select value={a.status} onValueChange={(v) => setAgendaStatus(a.id, v)}>
                <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{["pending", "discussed", "deferred", "resolved"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => delAgenda(a.id)}><X size={14} /></Button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Input placeholder="Add agenda item…" value={newAgenda} onChange={(e) => setNewAgenda(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addAgenda(); }} />
            <Button onClick={addAgenda}><Plus size={16} /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Attendance */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users size={18} /> Attendance {summary && <span className="text-xs font-normal text-muted-foreground">({summary.attendedCount} present)</span>}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {attendance.length === 0 && <p className="text-sm text-muted-foreground">No attendees recorded yet.</p>}
          {attendance.map((a) => (
            <div key={a.id} className="flex items-center gap-2 border-b py-2">
              <input type="checkbox" checked={a.attended} onChange={() => toggleAttended(a)} className="accent-primary" />
              <span className="flex-1 text-sm">{a.user?.name || a.user_id}</span>
              {a.attended && <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">Present</Badge>}
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => removeAttendee(a.id)}><X size={14} /></Button>
            </div>
          ))}
          <div className="relative pt-1">
            <div className="flex gap-2 items-center"><UserPlus size={16} className="text-muted-foreground" /><Input placeholder="Search a member to add…" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} /></div>
            {filteredMembers.length > 0 && (
              <div className="mt-1 border rounded-md divide-y bg-background">
                {filteredMembers.map((m) => (
                  <button key={m.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50" onClick={() => addAttendee(m.id)}>{m.name} <span className="text-xs text-muted-foreground">{m.email}</span></button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Minutes */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText size={18} /> Minutes {meeting.minutes_finalized && <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">Finalized</Badge>}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={8} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Record the minutes of the meeting…" disabled={meeting.minutes_finalized} />
          <div className="flex gap-2">
            {!meeting.minutes_finalized ? (
              <>
                <Button variant="outline" onClick={() => saveMinutes()}>Save draft</Button>
                <Button onClick={() => saveMinutes(true)}><CheckCircle2 size={16} className="mr-1" /> Finalize</Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => saveMinutes(false)}>Reopen for editing</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
