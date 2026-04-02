"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Zap,
  Trash2,
  CalendarDays,
  ArrowLeft,
  GitBranch,
  MessageSquare,
  Paperclip,
  Receipt,
  Send,
  Upload,
  FileText,
  Plus,
  ChevronRight,
  Lock,
  Unlock,
  Timer,
  IndianRupee,
  Pencil,
  Hourglass,
} from "lucide-react";
import { toast } from "sonner";
import type { Todo, TodoNote, TodoAttachment, TodoVoucher, Member, Team, TimeEntry } from "./types";

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800", icon: Clock },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-800", icon: CheckCircle2 },
  in_progress: { label: "In Progress", color: "bg-indigo-100 text-indigo-800", icon: Zap },
  review: { label: "Under Review", color: "bg-purple-100 text-purple-800", icon: Clock },
  completed: { label: "Completed", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800", icon: XCircle },
};

function TimeboxProgress({ totalHours, timeboxHours, contributors }: { totalHours: number; timeboxHours: number; contributors: number }) {
  const percent = Math.min((totalHours / timeboxHours) * 100, 150);
  const isOverdue = totalHours > timeboxHours;
  const isWarning = percent >= 75 && !isOverdue;
  const barColor = isOverdue ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-green-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1">
          <Hourglass size={11} />
          {Math.floor(totalHours)}h {Math.round((totalHours % 1) * 60)}m / {timeboxHours}h
          {contributors > 0 && <span className="text-muted-foreground">({contributors} contributor{contributors !== 1 ? "s" : ""})</span>}
        </span>
        {isOverdue && (
          <span className="text-red-600 font-medium">
            Overdue by {Math.floor(totalHours - timeboxHours)}h {Math.round(((totalHours - timeboxHours) % 1) * 60)}m
          </span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

interface TodoDetailViewProps {
  todo: Todo;
  subtasks: Todo[];
  notes: TodoNote[];
  attachments: TodoAttachment[];
  vouchers: TodoVoucher[];
  timeEntries: TimeEntry[];
  timeEntryTotalHours: number;
  timeEntryContributors: number;
  loadingDetail: boolean;
  members: Member[];
  teams: Team[];
  onBack: () => void;
  onRefresh: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onOpenSubtask: (todo: Todo) => void;
  onQuickAction: (todo: Todo, status: string) => void;
  onUpdateTodo: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onFetchData: () => void;
  onFetchTimeEntries: (todoId: string) => void;
  onSetSubtasks: (subtasks: Todo[]) => void;
  onSetNotes: (notes: TodoNote[]) => void;
  onSetAttachments: (attachments: TodoAttachment[]) => void;
  onSetVouchers: (vouchers: TodoVoucher[]) => void;
  onSetSelectedTodo: (todo: Todo | null) => void;
}

export default function TodoDetailView({
  todo,
  subtasks,
  notes,
  attachments,
  vouchers,
  timeEntries,
  timeEntryTotalHours,
  timeEntryContributors,
  loadingDetail,
  onBack,
  onEdit,
  onOpenSubtask,
  onQuickAction,
  onUpdateTodo,
  onDelete,
  onFetchData,
  onFetchTimeEntries,
  onSetSubtasks,
  onSetNotes,
  onSetAttachments,
  onSetVouchers,
  onSetSelectedTodo,
}: TodoDetailViewProps) {
  const [detailTab, setDetailTab] = useState<"subtasks" | "notes" | "files" | "vouchers" | "timelog">("subtasks");
  const [editingTitle, setEditingTitle] = useState(false);
  const [inlineTitle, setInlineTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState<"note" | "report" | "update">("note");
  const [timeLogHours, setTimeLogHours] = useState("");
  const [timeLogMinutes, setTimeLogMinutes] = useState("");
  const [timeLogDesc, setTimeLogDesc] = useState("");
  const [timeLogSaving, setTimeLogSaving] = useState(false);
  const [showCreateSubtask, setShowCreateSubtask] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskDescription, setSubtaskDescription] = useState("");
  const [subtaskDueDate, setSubtaskDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const sc = statusConfig[todo.status] || statusConfig.pending;
  const StatusIcon = sc.icon;

  async function handleAddNote() {
    if (!noteContent.trim()) return;
    try {
      const res = await fetch("/api/todos/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todo_id: todo.id, content: noteContent.trim(), type: noteType }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      onSetNotes([...notes, data.note]);
      setNoteContent("");
      setNoteType("note");
      toast.success("Note added");
    } catch {
      toast.error("Failed to add note");
    }
  }

  async function handleUploadAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("todo_id", todo.id);
    try {
      const res = await fetch("/api/todos/attachments", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      onSetAttachments([...attachments, data.attachment]);
      toast.success("File uploaded");
    } catch {
      toast.error("Failed to upload file");
    }
    e.target.value = "";
  }

  async function handleVoucherAction(voucherId: string, status: string, remarks?: string) {
    try {
      const res = await fetch("/api/todos/vouchers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: voucherId, status, remarks: remarks || "" }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Voucher ${status}`);
      const vRes = await fetch(`/api/todos/vouchers?todo_id=${todo.id}`).then((r) => r.json());
      onSetVouchers(vRes.vouchers || []);
    } catch {
      toast.error("Failed to update voucher");
    }
  }

  async function handleDeleteNote(id: string) {
    try {
      await fetch(`/api/todos/notes?id=${id}`, { method: "DELETE" });
      onSetNotes(notes.filter((n) => n.id !== id));
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleDeleteAttachment(id: string) {
    try {
      await fetch(`/api/todos/attachments?id=${id}`, { method: "DELETE" });
      onSetAttachments(attachments.filter((a) => a.id !== id));
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleReleaseCommitment() {
    try {
      const res = await fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: todo.id, action: "release_commitment" }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Commitment released");
      onFetchData();
      onSetSelectedTodo({ ...todo, committed_by: null, committed_at: null, estimated_time: "", estimated_amount: 0, timebox_hours: null, committer: null });
    } catch {
      toast.error("Failed to release commitment");
    }
  }

  async function handleCreateSubtask() {
    if (!subtaskTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subtaskTitle.trim(),
          description: subtaskDescription.trim(),
          due_date: subtaskDueDate || null,
          parent_id: todo.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Sub-task created");
      setShowCreateSubtask(false);
      setSubtaskTitle("");
      setSubtaskDescription("");
      setSubtaskDueDate("");
      const subtasksRes = await fetch(`/api/todos?parent_id=${todo.id}`).then((r) => r.json());
      onSetSubtasks(subtasksRes.todos || []);
      onFetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create sub-task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={16} className="mr-1" /> Back
        </Button>
        <Button variant="outline" size="sm" onClick={() => onEdit(todo)}>
          Manage Task
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { onDelete(todo.id); onBack(); }}>
          <Trash2 size={14} className="mr-1" /> Delete
        </Button>
      </div>

      {/* Task Info */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs font-mono bg-primary/5 text-primary border-primary/20">
              {todo.event_id}
            </Badge>
            <Badge variant="outline" className={`text-xs ${sc.color}`}>
              <StatusIcon size={10} className="mr-1" />
              {sc.label}
            </Badge>
            {(todo.urgent || todo.important) && (
              <Badge variant="outline" className={`text-xs ${todo.urgent && todo.important ? "bg-red-100 text-red-700" : todo.important ? "bg-blue-100 text-blue-700" : todo.urgent ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                {todo.urgent && todo.important ? "Do First" : todo.important ? "Schedule" : todo.urgent ? "Delegate" : "Eliminate"}
              </Badge>
            )}
          </div>
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                value={inlineTitle}
                onChange={(e) => setInlineTitle(e.target.value)}
                className="text-lg font-bold h-9"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (inlineTitle.trim() && inlineTitle !== todo.title) {
                      onUpdateTodo(todo.id, { title: inlineTitle.trim() });
                      onSetSelectedTodo({ ...todo, title: inlineTitle.trim() });
                    }
                    setEditingTitle(false);
                  } else if (e.key === "Escape") {
                    setEditingTitle(false);
                  }
                }}
                onBlur={() => {
                  if (inlineTitle.trim() && inlineTitle !== todo.title) {
                    onUpdateTodo(todo.id, { title: inlineTitle.trim() });
                    onSetSelectedTodo({ ...todo, title: inlineTitle.trim() });
                  }
                  setEditingTitle(false);
                }}
              />
            </div>
          ) : (
            <h2
              className="text-lg font-bold cursor-pointer hover:text-primary/80 flex items-center gap-2 group"
              onClick={() => { setInlineTitle(todo.title); setEditingTitle(true); }}
            >
              {todo.title}
              <Pencil size={14} className="opacity-0 group-hover:opacity-50 transition-opacity" />
            </h2>
          )}
          {todo.description && <p className="text-sm text-muted-foreground">{todo.description}</p>}

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {todo.submitter && (
              <span className="flex items-center gap-1">
                <Avatar className="w-4 h-4">
                  {todo.submitter.photo_url && <AvatarImage src={todo.submitter.photo_url} />}
                  <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{todo.submitter.name?.charAt(0)}</AvatarFallback>
                </Avatar>
                Submitted by {todo.submitter.name}
              </span>
            )}
            {todo.due_date && (
              <span className="flex items-center gap-1">
                <CalendarDays size={12} /> Due: {new Date(todo.due_date).toLocaleDateString("en-IN")}
              </span>
            )}
            {todo.assignee && <span>Assigned to {todo.assignee.name}</span>}
            {todo.assigned_team && (
              <span className="font-medium text-primary">{todo.assigned_team.icon} {todo.assigned_team.name}</span>
            )}
          </div>

          {todo.admin_remarks && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
              <span className="font-medium">Admin remarks:</span> {todo.admin_remarks}
            </div>
          )}

          {/* Commitment Status */}
          {todo.committer ? (
            <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/50 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock size={14} className="text-indigo-600" />
                  <span className="text-sm font-semibold text-indigo-700">Committed by</span>
                  <Avatar className="w-5 h-5">
                    {todo.committer.photo_url && <AvatarImage src={todo.committer.photo_url} />}
                    <AvatarFallback className="text-[8px] bg-indigo-200 text-indigo-700">{todo.committer.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-indigo-700">{todo.committer.name}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 gap-1"
                  onClick={handleReleaseCommitment}
                >
                  <Unlock size={12} /> Release
                </Button>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-indigo-600">
                {todo.committed_at && (
                  <span>{new Date(todo.committed_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                )}
                {todo.estimated_time && (
                  <span className="flex items-center gap-1"><Timer size={11} /> Est. Time: {todo.estimated_time}</span>
                )}
                {todo.estimated_amount > 0 && (
                  <span className="flex items-center gap-1"><IndianRupee size={11} /> Est. Amount: ₹{Number(todo.estimated_amount).toLocaleString("en-IN")}</span>
                )}
                {todo.timebox_hours && (
                  <span className="flex items-center gap-1"><Hourglass size={11} /> Timebox: {todo.timebox_hours}h</span>
                )}
              </div>
              {todo.timebox_hours && (
                <div className="mt-2">
                  <TimeboxProgress totalHours={timeEntryTotalHours} timeboxHours={todo.timebox_hours} contributors={timeEntryContributors} />
                </div>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Label className="text-xs text-indigo-600">Timebox:</Label>
                <Input
                  type="number" step="0.5" min="0.5"
                  className="h-7 w-20 text-xs"
                  defaultValue={todo.timebox_hours || ""}
                  onBlur={(e) => {
                    const val = e.target.value ? parseFloat(e.target.value) : null;
                    onUpdateTodo(todo.id, { timebox_hours: val });
                  }}
                />
                <span className="text-xs text-muted-foreground">hours</span>
              </div>
            </div>
          ) : (todo.status === "approved" || todo.status === "in_progress") && (
            <div className="text-xs text-muted-foreground italic flex items-center gap-1">
              <Lock size={11} /> No member has committed yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {([
          { key: "subtasks", label: "Sub-Tasks", icon: GitBranch, count: subtasks.length },
          { key: "timelog", label: "Time Log", icon: Hourglass, count: timeEntries.length },
          { key: "notes", label: "Notes & Reports", icon: MessageSquare, count: notes.length },
          { key: "files", label: "Deliverables", icon: Paperclip, count: attachments.length },
          { key: "vouchers", label: "Vouchers/Bills", icon: Receipt, count: vouchers.length },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setDetailTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              detailTab === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
            {tab.count > 0 && <span className="text-xs opacity-70">({tab.count})</span>}
          </button>
        ))}
      </div>

      {loadingDetail ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : (
        <>
          {/* Sub-Tasks */}
          {detailTab === "subtasks" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {subtasks.length === 0 ? "No sub-tasks." : `${subtasks.length} sub-task(s)`}
                </p>
                <Button size="sm" variant="outline" onClick={() => { setShowCreateSubtask(true); setSubtaskTitle(""); setSubtaskDescription(""); setSubtaskDueDate(""); }} className="gap-1.5">
                  <Plus size={14} /> Add Sub-Task
                </Button>
              </div>
              {subtasks.map((st) => {
                const stSc = statusConfig[st.status] || statusConfig.pending;
                const StIcon = stSc.icon;
                return (
                  <Card key={st.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onOpenSubtask(st)}>
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start gap-2">
                        <StIcon size={16} className={st.status === "completed" ? "text-green-600 mt-0.5" : "text-amber-500 mt-0.5"} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] font-mono bg-primary/5 text-primary border-primary/20">{st.event_id}</Badge>
                            <h4 className="text-sm font-medium truncate">{st.title}</h4>
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${stSc.color}`}>{stSc.label}</Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                            {st.assignee && <span>Assigned: {st.assignee.name}</span>}
                            {st.assigned_team && <span className="text-primary">{st.assigned_team.icon} {st.assigned_team.name}</span>}
                            {st.due_date && <span className="flex items-center gap-0.5"><CalendarDays size={10} />{new Date(st.due_date).toLocaleDateString("en-IN")}</span>}
                            {st.subtask_count > 0 && <span className="flex items-center gap-0.5"><GitBranch size={10} />{st.subtask_count}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {st.status === "pending" && (
                            <>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-green-700 hover:bg-green-50" onClick={(e) => { e.stopPropagation(); onQuickAction(st, "approved"); }}>Approve</Button>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); onQuickAction(st, "rejected"); }}>Reject</Button>
                            </>
                          )}
                          <ChevronRight size={16} className="text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Notes */}
          {detailTab === "notes" && (
            <div className="space-y-3">
              {notes.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No notes yet.</p>}
              {notes.map((note) => (
                <div key={note.id} className="rounded-xl border bg-white p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      {note.author && (
                        <span className="flex items-center gap-1">
                          <Avatar className="w-4 h-4">
                            {note.author.photo_url && <AvatarImage src={note.author.photo_url} />}
                            <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{note.author.name?.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{note.author.name}</span>
                        </span>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {note.type === "report" ? "Report" : note.type === "update" ? "Update" : "Note"}
                      </Badge>
                      <span className="text-muted-foreground">{new Date(note.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteNote(note.id)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                </div>
              ))}
              <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
                <div className="flex gap-2">
                  {(["note", "report", "update"] as const).map((t) => (
                    <button key={t} onClick={() => setNoteType(t)} className={`px-3 py-1 rounded-lg text-xs font-medium ${noteType === t ? "bg-primary text-primary-foreground" : "bg-white border text-muted-foreground"}`}>
                      {t === "report" ? "Report" : t === "update" ? "Update" : "Note"}
                    </button>
                  ))}
                </div>
                <Textarea placeholder="Add a note..." value={noteContent} onChange={(e) => setNoteContent(e.target.value)} rows={2} />
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleAddNote} disabled={!noteContent.trim()} className="gap-1.5">
                    <Send size={14} /> Send
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Files */}
          {detailTab === "files" && (
            <div className="space-y-3">
              {attachments.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No deliverables uploaded.</p>}
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-3 rounded-xl border bg-white p-3">
                  <div className="rounded-lg bg-primary/10 p-2"><FileText size={16} className="text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline truncate block">{att.file_name}</a>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {att.uploader && <span>{att.uploader.name}</span>}
                      <span>{new Date(att.created_at).toLocaleDateString("en-IN")}</span>
                      <Badge variant="outline" className="text-[10px]">{att.file_type.toUpperCase()}</Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteAttachment(att.id)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))}
              <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 cursor-pointer hover:bg-muted/30">
                <Upload size={16} className="text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Upload deliverable</span>
                <input type="file" className="hidden" onChange={handleUploadAttachment} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt" />
              </label>
            </div>
          )}

          {/* Vouchers (Admin can approve/reject) */}
          {detailTab === "vouchers" && (
            <div className="space-y-3">
              {vouchers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No vouchers raised for this task.</p>}
              {vouchers.map((v) => {
                const vColor = v.status === "approved" ? "bg-green-100 text-green-800" : v.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
                return (
                  <Card key={v.id}>
                    <CardContent className="pt-3 pb-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-sm font-medium">{v.title}</h4>
                          {v.description && <p className="text-xs text-muted-foreground">{v.description}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-bold">₹{Number(v.amount).toLocaleString("en-IN")}</span>
                          <Badge variant="outline" className={`ml-2 text-[10px] ${vColor}`}>
                            {v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {v.submitter && <span>By {v.submitter.name}</span>}
                        <span>{new Date(v.created_at).toLocaleDateString("en-IN")}</span>
                        {v.receipt_url && <a href={v.receipt_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">View receipt</a>}
                      </div>
                      {v.remarks && (
                        <div className="rounded-lg bg-muted/50 px-2 py-1 text-xs">
                          <span className="font-medium">Remarks:</span> {v.remarks}
                        </div>
                      )}
                      {v.status === "pending" && (
                        <div className="flex items-center gap-2 pt-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50" onClick={() => handleVoucherAction(v.id, "approved")}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300 hover:bg-red-50" onClick={() => handleVoucherAction(v.id, "rejected")}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Time Log Tab */}
          {detailTab === "timelog" && (
            <div className="space-y-3">
              {todo.timebox_hours && (
                <TimeboxProgress totalHours={timeEntryTotalHours} timeboxHours={todo.timebox_hours} contributors={timeEntryContributors} />
              )}

              {/* Log Time Form */}
              <Card className="border-primary/30">
                <CardContent className="pt-4 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2"><Hourglass size={14} /> Log Time</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Hours</Label>
                      <Input type="number" min="0" placeholder="0" value={timeLogHours} onChange={(e) => setTimeLogHours(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Minutes</Label>
                      <Input type="number" min="0" max="59" placeholder="0" value={timeLogMinutes} onChange={(e) => setTimeLogMinutes(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">What was done?</Label>
                      <Input placeholder="Brief description" value={timeLogDesc} onChange={(e) => setTimeLogDesc(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={((parseFloat(timeLogHours) || 0) + (parseFloat(timeLogMinutes) || 0)) <= 0 || timeLogSaving}
                      onClick={async () => {
                        setTimeLogSaving(true);
                        const totalHours = (parseFloat(timeLogHours) || 0) + (parseFloat(timeLogMinutes) || 0) / 60;
                        try {
                          const res = await fetch("/api/todos/time-entries", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ todo_id: todo.id, hours: Math.round(totalHours * 100) / 100, description: timeLogDesc }),
                          });
                          if (!res.ok) {
                            const data = await res.json();
                            throw new Error(data.error || "Failed");
                          }
                          toast.success("Time logged");
                          setTimeLogHours("");
                          setTimeLogMinutes("");
                          setTimeLogDesc("");
                          onFetchTimeEntries(todo.id);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed to log time");
                        } finally {
                          setTimeLogSaving(false);
                        }
                      }}
                    >
                      {timeLogSaving ? "Saving..." : "Log Time"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Time Entries List */}
              {timeEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No time entries yet</p>
              ) : (
                timeEntries.map((entry) => (
                  <Card key={entry.id}>
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="text-[8px]">{entry.users?.name?.charAt(0) || "?"}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{entry.users?.name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">
                              {Math.floor(entry.hours)}h {Math.round((entry.hours % 1) * 60)}m{entry.description && ` — ${entry.description}`}
                            </p>
                            <p className="text-xs text-muted-foreground">{new Date(entry.logged_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive h-7 w-7 p-0"
                          onClick={async () => {
                            const res = await fetch(`/api/todos/time-entries?id=${entry.id}`, { method: "DELETE" });
                            if (res.ok) {
                              toast.success("Entry deleted");
                              onFetchTimeEntries(todo.id);
                            } else {
                              toast.error("Failed to delete");
                            }
                          }}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Create Subtask Dialog */}
      <Dialog open={showCreateSubtask} onOpenChange={setShowCreateSubtask}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Sub-Task to {todo.event_id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input placeholder="Sub-task title" value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea placeholder="Details..." value={subtaskDescription} onChange={(e) => setSubtaskDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Due Date (optional)</Label>
              <Input type="date" value={subtaskDueDate} onChange={(e) => setSubtaskDueDate(e.target.value)} />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCreateSubtask(false)}>Cancel</Button>
              <Button onClick={handleCreateSubtask} disabled={saving || !subtaskTitle.trim()}>
                {saving ? "Creating..." : "Create Sub-Task"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
