"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  Star,
  CalendarDays,
  ListTodo,
  ChevronRight,
  ArrowLeft,
  MessageSquare,
  Paperclip,
  Receipt,
  Send,
  Upload,
  FileText,
  Trash2,
  GitBranch,
} from "lucide-react";
import { toast } from "sonner";

interface TodoUser {
  id: string;
  name: string;
  photo_url: string;
  occupation?: string;
}

interface TodoTeam {
  id: string;
  name: string;
  icon: string;
}

interface Todo {
  id: string;
  title: string;
  description: string;
  status: string;
  urgent: boolean;
  important: boolean;
  due_date: string | null;
  admin_remarks: string;
  submitted_by: string;
  assigned_to: string | null;
  assigned_team_id: string | null;
  parent_id: string | null;
  event_id: string;
  submitter: TodoUser | null;
  assignee: TodoUser | null;
  assigned_team: TodoTeam | null;
  created_at: string;
  completed_at: string | null;
  subtask_count: number;
}

interface TodoNote {
  id: string;
  todo_id: string;
  content: string;
  type: string;
  created_at: string;
  author: TodoUser | null;
}

interface TodoAttachment {
  id: string;
  todo_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  created_at: string;
  uploader: TodoUser | null;
}

interface TodoVoucher {
  id: string;
  todo_id: string;
  title: string;
  amount: number;
  description: string;
  receipt_url: string | null;
  status: string;
  remarks: string;
  created_at: string;
  submitter: TodoUser | null;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-800 border-blue-200", icon: CheckCircle2 },
  in_progress: { label: "In Progress", color: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: Zap },
  completed: { label: "Completed", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
};

function getQuadrantLabel(urgent: boolean, important: boolean) {
  if (urgent && important) return "Do First";
  if (!urgent && important) return "Schedule";
  if (urgent && !important) return "Delegate";
  return "Eliminate";
}

function getQuadrantColor(urgent: boolean, important: boolean) {
  if (urgent && important) return "bg-red-100 text-red-700 border-red-200";
  if (!urgent && important) return "bg-blue-100 text-blue-700 border-blue-200";
  if (urgent && !important) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  // Task detail view
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [subtasks, setSubtasks] = useState<Todo[]>([]);
  const [notes, setNotes] = useState<TodoNote[]>([]);
  const [attachments, setAttachments] = useState<TodoAttachment[]>([]);
  const [vouchers, setVouchers] = useState<TodoVoucher[]>([]);
  const [detailTab, setDetailTab] = useState<"subtasks" | "notes" | "files" | "vouchers">("subtasks");
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Subtask creation
  const [showCreateSubtask, setShowCreateSubtask] = useState(false);
  const [subtaskParentId, setSubtaskParentId] = useState<string | null>(null);

  // Note form
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState<"note" | "report" | "update">("note");

  // Voucher form
  const [showVoucherForm, setShowVoucherForm] = useState(false);
  const [voucherTitle, setVoucherTitle] = useState("");
  const [voucherAmount, setVoucherAmount] = useState("");
  const [voucherDescription, setVoucherDescription] = useState("");

  const fetchTodos = useCallback(async () => {
    try {
      const res = await fetch("/api/todos");
      const data = await res.json();
      setTodos(data.todos || []);
    } catch {
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  async function openTaskDetail(todo: Todo) {
    setSelectedTodo(todo);
    setDetailTab("subtasks");
    setLoadingDetail(true);

    try {
      const [subtasksRes, notesRes, attachmentsRes, vouchersRes] = await Promise.all([
        fetch(`/api/todos?parent_id=${todo.id}`).then((r) => r.json()),
        fetch(`/api/todos/notes?todo_id=${todo.id}`).then((r) => r.json()),
        fetch(`/api/todos/attachments?todo_id=${todo.id}`).then((r) => r.json()),
        fetch(`/api/todos/vouchers?todo_id=${todo.id}`).then((r) => r.json()),
      ]);
      setSubtasks(subtasksRes.todos || []);
      setNotes(notesRes.notes || []);
      setAttachments(attachmentsRes.attachments || []);
      setVouchers(vouchersRes.vouchers || []);
    } catch {
      toast.error("Failed to load task details");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleCreate() {
    if (!formTitle.trim()) {
      toast.error("Title is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDescription.trim(),
          due_date: formDueDate || null,
          parent_id: subtaskParentId || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to create");
      toast.success(subtaskParentId ? "Sub-task created" : "Task submitted for approval");
      setShowCreate(false);
      setShowCreateSubtask(false);
      setFormTitle("");
      setFormDescription("");
      setFormDueDate("");
      setSubtaskParentId(null);

      if (selectedTodo) {
        // Refresh subtasks
        const subtasksRes = await fetch(`/api/todos?parent_id=${selectedTodo.id}`).then((r) => r.json());
        setSubtasks(subtasksRes.todos || []);
      }
      fetchTodos();
    } catch {
      toast.error("Failed to submit task");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddNote() {
    if (!noteContent.trim() || !selectedTodo) return;

    try {
      const res = await fetch("/api/todos/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          todo_id: selectedTodo.id,
          content: noteContent.trim(),
          type: noteType,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setNotes((prev) => [...prev, data.note]);
      setNoteContent("");
      setNoteType("note");
      toast.success("Note added");
    } catch {
      toast.error("Failed to add note");
    }
  }

  async function handleUploadAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedTodo) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("todo_id", selectedTodo.id);

    try {
      const res = await fetch("/api/todos/attachments", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setAttachments((prev) => [...prev, data.attachment]);
      toast.success("File uploaded");
    } catch {
      toast.error("Failed to upload file");
    }
    e.target.value = "";
  }

  async function handleCreateVoucher() {
    if (!voucherTitle.trim() || !voucherAmount || !selectedTodo) return;

    try {
      const res = await fetch("/api/todos/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          todo_id: selectedTodo.id,
          title: voucherTitle.trim(),
          amount: parseFloat(voucherAmount),
          description: voucherDescription.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setVouchers((prev) => [data.voucher, ...prev]);
      setShowVoucherForm(false);
      setVoucherTitle("");
      setVoucherAmount("");
      setVoucherDescription("");
      toast.success("Voucher submitted for Finance Team approval");
    } catch {
      toast.error("Failed to create voucher");
    }
  }

  async function handleDeleteNote(id: string) {
    try {
      await fetch(`/api/todos/notes?id=${id}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== id));
      toast.success("Note deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleDeleteAttachment(id: string) {
    try {
      await fetch(`/api/todos/attachments?id=${id}`, { method: "DELETE" });
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      toast.success("Attachment deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  const tabs = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Completed" },
    { key: "rejected", label: "Rejected" },
  ];

  const filtered = activeTab === "all" ? todos : todos.filter((t) => t.status === activeTab);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Task Detail View
  if (selectedTodo) {
    const sc = statusConfig[selectedTodo.status] || statusConfig.pending;
    const StatusIcon = sc.icon;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedTodo(null)}>
            <ArrowLeft size={16} className="mr-1" /> Back
          </Button>
        </div>

        {/* Task Info Card */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-mono bg-primary/5 text-primary border-primary/20">
                    {selectedTodo.event_id}
                  </Badge>
                  <Badge variant="outline" className={`text-xs ${sc.color}`}>
                    <StatusIcon size={10} className="mr-1" />
                    {sc.label}
                  </Badge>
                  {(selectedTodo.urgent || selectedTodo.important) && selectedTodo.status !== "pending" && (
                    <Badge variant="outline" className={`text-xs ${getQuadrantColor(selectedTodo.urgent, selectedTodo.important)}`}>
                      {getQuadrantLabel(selectedTodo.urgent, selectedTodo.important)}
                    </Badge>
                  )}
                </div>
                <h2 className="text-lg font-bold">{selectedTodo.title}</h2>
              </div>
            </div>

            {selectedTodo.description && (
              <p className="text-sm text-muted-foreground">{selectedTodo.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {selectedTodo.submitter && (
                <span className="flex items-center gap-1">
                  <Avatar className="w-4 h-4">
                    {selectedTodo.submitter.photo_url && <AvatarImage src={selectedTodo.submitter.photo_url} />}
                    <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                      {selectedTodo.submitter.name?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  {selectedTodo.submitter.name}
                </span>
              )}
              {selectedTodo.due_date && (
                <span className="flex items-center gap-1">
                  <CalendarDays size={12} />
                  Due: {new Date(selectedTodo.due_date).toLocaleDateString("en-IN")}
                </span>
              )}
              {selectedTodo.assignee && (
                <span>Assigned to {selectedTodo.assignee.name}</span>
              )}
              {selectedTodo.assigned_team && (
                <span className="font-medium text-primary">
                  {selectedTodo.assigned_team.icon} {selectedTodo.assigned_team.name}
                </span>
              )}
            </div>

            {selectedTodo.admin_remarks && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                <span className="font-medium">Admin remarks:</span> {selectedTodo.admin_remarks}
              </div>
            )}

            {selectedTodo.urgent && (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <AlertTriangle size={12} /> Urgent
              </div>
            )}
            {selectedTodo.important && (
              <div className="flex items-center gap-1 text-xs text-blue-600">
                <Star size={12} /> Important
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail Tabs */}
        <div className="flex flex-wrap gap-2 border-b pb-2">
          {([
            { key: "subtasks", label: "Sub-Tasks", icon: GitBranch, count: subtasks.length },
            { key: "notes", label: "Notes & Reports", icon: MessageSquare, count: notes.length },
            { key: "files", label: "Deliverables", icon: Paperclip, count: attachments.length },
            { key: "vouchers", label: "Vouchers/Bills", icon: Receipt, count: vouchers.length },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setDetailTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                detailTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.count > 0 && (
                <span className="text-xs opacity-70">({tab.count})</span>
              )}
            </button>
          ))}
        </div>

        {loadingDetail ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            {/* Sub-Tasks Tab */}
            {detailTab === "subtasks" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {subtasks.length === 0 ? "No sub-tasks yet." : `${subtasks.length} sub-task(s)`}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSubtaskParentId(selectedTodo.id);
                      setShowCreateSubtask(true);
                      setFormTitle("");
                      setFormDescription("");
                      setFormDueDate("");
                    }}
                    className="gap-1.5"
                  >
                    <Plus size={14} />
                    Add Sub-Task
                  </Button>
                </div>

                {subtasks.map((st) => {
                  const stSc = statusConfig[st.status] || statusConfig.pending;
                  const StIcon = stSc.icon;
                  return (
                    <Card key={st.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openTaskDetail(st)}>
                      <CardContent className="pt-3 pb-3">
                        <div className="flex items-start gap-2">
                          <StIcon size={16} className={st.status === "completed" ? "text-green-600 mt-0.5" : "text-amber-500 mt-0.5"} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] font-mono bg-primary/5 text-primary border-primary/20">
                                {st.event_id}
                              </Badge>
                              <h4 className="text-sm font-medium truncate">{st.title}</h4>
                              <Badge variant="outline" className={`text-[10px] shrink-0 ${stSc.color}`}>{stSc.label}</Badge>
                            </div>
                            {st.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{st.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                              {st.due_date && (
                                <span className="flex items-center gap-0.5">
                                  <CalendarDays size={10} />
                                  {new Date(st.due_date).toLocaleDateString("en-IN")}
                                </span>
                              )}
                              {st.subtask_count > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <GitBranch size={10} />
                                  {st.subtask_count} sub-task(s)
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-1" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Notes & Reports Tab */}
            {detailTab === "notes" && (
              <div className="space-y-3">
                {/* Note list */}
                {notes.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No notes yet. Add a note or report below.</p>
                )}
                {notes.map((note) => (
                  <div key={note.id} className="rounded-xl border bg-white p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs">
                        {note.author && (
                          <span className="flex items-center gap-1">
                            <Avatar className="w-4 h-4">
                              {note.author.photo_url && <AvatarImage src={note.author.photo_url} />}
                              <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                {note.author.name?.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{note.author.name}</span>
                          </span>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {note.type === "report" ? "Report" : note.type === "update" ? "Update" : "Note"}
                        </Badge>
                        <span className="text-muted-foreground">
                          {new Date(note.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteNote(note.id)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))}

                {/* Add note form */}
                <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
                  <div className="flex gap-2">
                    {(["note", "report", "update"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setNoteType(t)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          noteType === t ? "bg-primary text-primary-foreground" : "bg-white border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {t === "report" ? "Report" : t === "update" ? "Update" : "Note"}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    placeholder={noteType === "report" ? "Submit your report or deliverable description..." : noteType === "update" ? "Share a progress update..." : "Add a note..."}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    rows={2}
                  />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleAddNote} disabled={!noteContent.trim()} className="gap-1.5">
                      <Send size={14} />
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Deliverables/Files Tab */}
            {detailTab === "files" && (
              <div className="space-y-3">
                {attachments.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No deliverables uploaded yet.</p>
                )}
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-3 rounded-xl border bg-white p-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <FileText size={16} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline truncate block">
                        {att.file_name}
                      </a>
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

                {/* Upload button */}
                <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 cursor-pointer hover:bg-muted/30 transition-colors">
                  <Upload size={16} className="text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Upload deliverable (PDF, DOC, images, max 10MB)</span>
                  <input type="file" className="hidden" onChange={handleUploadAttachment} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt" />
                </label>
              </div>
            )}

            {/* Vouchers/Bills Tab */}
            {detailTab === "vouchers" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {vouchers.length === 0 ? "No vouchers raised." : `${vouchers.length} voucher(s)`}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setShowVoucherForm(true)} className="gap-1.5">
                    <Receipt size={14} />
                    Raise Voucher
                  </Button>
                </div>

                {vouchers.map((v) => {
                  const vColor = v.status === "approved" ? "bg-green-100 text-green-800" : v.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
                  return (
                    <Card key={v.id}>
                      <CardContent className="pt-3 pb-3 space-y-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="text-sm font-medium">{v.title}</h4>
                            {v.description && <p className="text-xs text-muted-foreground">{v.description}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-sm font-bold">₹{Number(v.amount).toLocaleString("en-IN")}</span>
                            <Badge variant="outline" className={`ml-2 text-[10px] ${vColor}`}>
                              {v.status === "approved" ? "Approved" : v.status === "rejected" ? "Rejected" : "Pending"}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {v.submitter && <span>By {v.submitter.name}</span>}
                          <span>{new Date(v.created_at).toLocaleDateString("en-IN")}</span>
                        </div>
                        {v.remarks && (
                          <div className="rounded-lg bg-muted/50 px-2 py-1 text-xs mt-1">
                            <span className="font-medium">Finance remarks:</span> {v.remarks}
                          </div>
                        )}
                        {v.receipt_url && (
                          <a href={v.receipt_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                            View receipt
                          </a>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

                {/* Voucher creation form */}
                {showVoucherForm && (
                  <Card className="border-primary/30">
                    <CardContent className="pt-4 space-y-3">
                      <h4 className="text-sm font-semibold">New Voucher / Bill</h4>
                      <div className="space-y-2">
                        <Label className="text-xs">Title</Label>
                        <Input placeholder="e.g., Printing costs, Travel expenses" value={voucherTitle} onChange={(e) => setVoucherTitle(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Amount (₹)</Label>
                        <Input type="number" placeholder="0" value={voucherAmount} onChange={(e) => setVoucherAmount(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Description (optional)</Label>
                        <Textarea placeholder="Details about this expense..." value={voucherDescription} onChange={(e) => setVoucherDescription(e.target.value)} rows={2} />
                      </div>
                      <p className="text-xs text-muted-foreground">This voucher will be sent to the Finance Team for approval.</p>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setShowVoucherForm(false)}>Cancel</Button>
                        <Button size="sm" onClick={handleCreateVoucher} disabled={!voucherTitle.trim() || !voucherAmount}>
                          Submit Voucher
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </>
        )}

        {/* Create Subtask Dialog */}
        <Dialog open={showCreateSubtask} onOpenChange={setShowCreateSubtask}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Sub-Task to {selectedTodo.event_id}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input placeholder="What needs to be done?" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea placeholder="Provide details..." value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Due Date (optional)</Label>
                <Input type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowCreateSubtask(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={saving}>
                  {saving ? "Creating..." : "Create Sub-Task"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Main Task List View
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">To-Do List</h1>
        <Button onClick={() => { setShowCreate(true); setSubtaskParentId(null); }} className="gap-2">
          <Plus size={16} />
          Submit Task
        </Button>
      </div>

      {/* Status Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const count = tab.key === "all" ? todos.length : todos.filter((t) => t.status === tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border hover:bg-accent/50 text-foreground"
              }`}
            >
              {tab.label}
              <span className="ml-2 text-xs opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Task List */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((todo) => {
            const sc = statusConfig[todo.status] || statusConfig.pending;
            const StatusIcon = sc.icon;
            return (
              <Card key={todo.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openTaskDetail(todo)}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <StatusIcon size={18} className={todo.status === "completed" ? "text-green-600" : todo.status === "rejected" ? "text-red-500" : "text-amber-500"} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] font-mono bg-primary/5 text-primary border-primary/20">
                            {todo.event_id}
                          </Badge>
                          <h3 className="font-semibold text-sm">{todo.title}</h3>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {(todo.urgent || todo.important) && todo.status !== "pending" && (
                            <Badge variant="outline" className={`text-xs ${getQuadrantColor(todo.urgent, todo.important)}`}>
                              {getQuadrantLabel(todo.urgent, todo.important)}
                            </Badge>
                          )}
                          <Badge variant="outline" className={`text-xs ${sc.color}`}>
                            {sc.label}
                          </Badge>
                        </div>
                      </div>

                      {todo.description && (
                        <p className="text-xs text-muted-foreground">{todo.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {todo.due_date && (
                          <span className="flex items-center gap-1">
                            <CalendarDays size={12} />
                            Due: {new Date(todo.due_date).toLocaleDateString("en-IN")}
                          </span>
                        )}
                        {todo.assignee && (
                          <span className="flex items-center gap-1">
                            <Avatar className="w-4 h-4">
                              {todo.assignee.photo_url && <AvatarImage src={todo.assignee.photo_url} />}
                              <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                {todo.assignee.name?.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            Assigned to {todo.assignee.name}
                          </span>
                        )}
                        {todo.assigned_team && (
                          <span className="flex items-center gap-1 font-medium text-primary">
                            {todo.assigned_team.icon ? `${todo.assigned_team.icon} ` : ""}
                            Assigned to {todo.assigned_team.name}
                          </span>
                        )}
                        {todo.subtask_count > 0 && (
                          <span className="flex items-center gap-1">
                            <GitBranch size={12} />
                            {todo.subtask_count} sub-task(s)
                          </span>
                        )}
                        <span>
                          {new Date(todo.created_at).toLocaleDateString("en-IN")}
                        </span>
                      </div>

                      {todo.admin_remarks && (
                        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                          <span className="font-medium">Admin remarks:</span> {todo.admin_remarks}
                        </div>
                      )}
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground shrink-0 mt-2" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <ListTodo className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No tasks found.</p>
          <p className="text-sm mt-1">Submit a new task to get started.</p>
        </div>
      )}

      {/* Create Task Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Submit a Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="What needs to be done?"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Provide details about this task..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Suggested Due Date (optional)</Label>
              <Input
                type="date"
                value={formDueDate}
                onChange={(e) => setFormDueDate(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Your task will be submitted for admin approval. The admin will set the priority and assign it.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "Submitting..." : "Submit Task"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
