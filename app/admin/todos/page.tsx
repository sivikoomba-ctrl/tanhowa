"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Zap,
  Trash2,
  CalendarDays,
  ListTodo,
  LayoutGrid,
  List,
  AlertTriangle,
  Star,
  Search,
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
} from "lucide-react";
import { toast } from "sonner";

interface TodoUser {
  id: string;
  name: string;
  photo_url: string;
  occupation?: string;
}

interface Team {
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
  committed_by: string | null;
  committed_at: string | null;
  estimated_time: string;
  estimated_amount: number;
  assigned_team: Team | null;
  committer: TodoUser | null;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
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
  todo?: { id: string; title: string; event_id: string } | null;
}

interface Member {
  id: string;
  name: string;
  photo_url: string;
  occupation: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800", icon: Clock },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-800", icon: CheckCircle2 },
  in_progress: { label: "In Progress", color: "bg-indigo-100 text-indigo-800", icon: Zap },
  completed: { label: "Completed", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800", icon: XCircle },
};

const quadrants = [
  { urgent: true, important: true, label: "Do First", subtitle: "Urgent & Important", color: "border-red-300 bg-red-50/50", headerColor: "bg-red-500 text-white", icon: Zap },
  { urgent: false, important: true, label: "Schedule", subtitle: "Not Urgent & Important", color: "border-blue-300 bg-blue-50/50", headerColor: "bg-blue-500 text-white", icon: CalendarDays },
  { urgent: true, important: false, label: "Delegate", subtitle: "Urgent & Not Important", color: "border-amber-300 bg-amber-50/50", headerColor: "bg-amber-500 text-white", icon: AlertTriangle },
  { urgent: false, important: false, label: "Eliminate", subtitle: "Not Urgent & Not Important", color: "border-gray-300 bg-gray-50/50", headerColor: "bg-gray-500 text-white", icon: XCircle },
];

export default function AdminTodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "matrix">("matrix");
  const [editTodo, setEditTodo] = useState<Todo | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editUrgent, setEditUrgent] = useState(false);
  const [editImportant, setEditImportant] = useState(false);
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Task detail view
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [subtasks, setSubtasks] = useState<Todo[]>([]);
  const [notes, setNotes] = useState<TodoNote[]>([]);
  const [attachments, setAttachments] = useState<TodoAttachment[]>([]);
  const [vouchers, setVouchers] = useState<TodoVoucher[]>([]);
  const [detailTab, setDetailTab] = useState<"subtasks" | "notes" | "files" | "vouchers">("subtasks");
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Note form
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState<"note" | "report" | "update">("note");

  // Subtask creation
  const [showCreateSubtask, setShowCreateSubtask] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskDescription, setSubtaskDescription] = useState("");
  const [subtaskDueDate, setSubtaskDueDate] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [todosRes, membersRes, teamsRes] = await Promise.all([
        fetch("/api/todos").then((r) => r.json()),
        fetch("/api/users").then((r) => r.json()),
        fetch("/api/teams").then((r) => r.json()),
      ]);
      setTodos(todosRes.todos || []);
      setMembers(membersRes.users || []);
      setTeams((teamsRes.teams || []).map((t: Team & Record<string, unknown>) => ({ id: t.id, name: t.name, icon: t.icon })));
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  function openEdit(todo: Todo) {
    setEditTodo(todo);
    setEditStatus(todo.status);
    setEditUrgent(todo.urgent);
    setEditImportant(todo.important);
    setEditAssignedTo(todo.assigned_team_id ? `team:${todo.assigned_team_id}` : todo.assigned_to || "none");
    setEditRemarks(todo.admin_remarks);
    setEditDueDate(todo.due_date || "");
  }

  async function handleUpdate() {
    if (!editTodo) return;
    setSaving(true);
    try {
      const res = await fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editTodo.id,
          status: editStatus,
          urgent: editUrgent,
          important: editImportant,
          assigned_to: editAssignedTo.startsWith("team:") ? null : editAssignedTo === "none" ? null : editAssignedTo,
          assigned_team_id: editAssignedTo.startsWith("team:") ? editAssignedTo.replace("team:", "") : null,
          admin_remarks: editRemarks,
          due_date: editDueDate || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Task updated");
      setEditTodo(null);
      fetchData();
    } catch {
      toast.error("Failed to update task");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this task?")) return;
    try {
      const res = await fetch(`/api/todos?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Task deleted");
      fetchData();
    } catch {
      toast.error("Failed to delete task");
    }
  }

  async function quickAction(todo: Todo, status: string) {
    try {
      const res = await fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: todo.id, status }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Task ${status === "approved" ? "approved" : status === "rejected" ? "rejected" : "updated"}`);
      fetchData();
    } catch {
      toast.error("Failed to update task");
    }
  }

  async function handleAddNote() {
    if (!noteContent.trim() || !selectedTodo) return;
    try {
      const res = await fetch("/api/todos/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todo_id: selectedTodo.id, content: noteContent.trim(), type: noteType }),
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
      const res = await fetch("/api/todos/attachments", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setAttachments((prev) => [...prev, data.attachment]);
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
      // Refresh vouchers
      if (selectedTodo) {
        const vRes = await fetch(`/api/todos/vouchers?todo_id=${selectedTodo.id}`).then((r) => r.json());
        setVouchers(vRes.vouchers || []);
      }
    } catch {
      toast.error("Failed to update voucher");
    }
  }

  async function handleDeleteNote(id: string) {
    try {
      await fetch(`/api/todos/notes?id=${id}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleDeleteAttachment(id: string) {
    try {
      await fetch(`/api/todos/attachments?id=${id}`, { method: "DELETE" });
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleReleaseCommitment(todoId: string) {
    try {
      const res = await fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: todoId, action: "release_commitment" }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Commitment released");
      fetchData();
      if (selectedTodo) {
        openTaskDetail({ ...selectedTodo, committed_by: null, committed_at: null, estimated_time: "", estimated_amount: 0, committer: null });
      }
    } catch {
      toast.error("Failed to release commitment");
    }
  }

  async function handleCreateSubtask() {
    if (!subtaskTitle.trim() || !selectedTodo) return;
    setSaving(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subtaskTitle.trim(),
          description: subtaskDescription.trim(),
          due_date: subtaskDueDate || null,
          parent_id: selectedTodo.id,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Sub-task created");
      setShowCreateSubtask(false);
      setSubtaskTitle("");
      setSubtaskDescription("");
      setSubtaskDueDate("");
      const subtasksRes = await fetch(`/api/todos?parent_id=${selectedTodo.id}`).then((r) => r.json());
      setSubtasks(subtasksRes.todos || []);
      fetchData();
    } catch {
      toast.error("Failed to create sub-task");
    } finally {
      setSaving(false);
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

  const filtered = useMemo(() => {
    let list = activeTab === "all" ? todos : todos.filter((t) => t.status === activeTab);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.submitter?.name?.toLowerCase().includes(q) ||
          t.event_id?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [todos, activeTab, search]);

  const matrixTodos = useMemo(() => {
    return todos.filter((t) => t.status !== "pending" && t.status !== "rejected");
  }, [todos]);

  function TodoCard({ todo, compact }: { todo: Todo; compact?: boolean }) {
    const sc = statusConfig[todo.status] || statusConfig.pending;
    return (
      <div
        className={`rounded-xl border bg-white p-3 hover:shadow-md transition-shadow cursor-pointer ${compact ? "text-xs" : ""}`}
        onClick={() => openTaskDetail(todo)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Badge variant="outline" className="text-[9px] font-mono bg-primary/5 text-primary border-primary/20 shrink-0">
              {todo.event_id}
            </Badge>
            <h4 className={`font-medium ${compact ? "text-xs" : "text-sm"} line-clamp-1`}>{todo.title}</h4>
          </div>
          <Badge variant="outline" className={`text-[10px] shrink-0 ${sc.color}`}>{sc.label}</Badge>
        </div>
        {!compact && todo.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{todo.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
          {todo.submitter && (
            <span className="flex items-center gap-1">
              <Avatar className="w-4 h-4">
                {todo.submitter.photo_url && <AvatarImage src={todo.submitter.photo_url} />}
                <AvatarFallback className="text-[6px] bg-primary/10 text-primary">{todo.submitter.name?.charAt(0)}</AvatarFallback>
              </Avatar>
              {todo.submitter.name}
            </span>
          )}
          {todo.assigned_team && (
            <span className="flex items-center gap-0.5 font-medium text-primary">
              {todo.assigned_team.icon ? `${todo.assigned_team.icon} ` : ""}{todo.assigned_team.name}
            </span>
          )}
          {todo.committer && (
            <span className="flex items-center gap-0.5 text-indigo-600 font-medium">
              <Lock size={9} /> {todo.committer.name}
            </span>
          )}
          {todo.estimated_time && (
            <span className="flex items-center gap-0.5">
              <Timer size={9} /> {todo.estimated_time}
            </span>
          )}
          {todo.estimated_amount > 0 && (
            <span className="flex items-center gap-0.5">
              <IndianRupee size={9} /> ₹{Number(todo.estimated_amount).toLocaleString("en-IN")}
            </span>
          )}
          {todo.due_date && (
            <span className="flex items-center gap-0.5">
              <CalendarDays size={10} />
              {new Date(todo.due_date).toLocaleDateString("en-IN")}
            </span>
          )}
          {todo.subtask_count > 0 && (
            <span className="flex items-center gap-0.5">
              <GitBranch size={10} />
              {todo.subtask_count}
            </span>
          )}
        </div>
        {!compact && todo.status === "pending" && (
          <div className="flex items-center gap-2 mt-2">
            <Button size="sm" variant="outline" className="h-6 text-xs text-green-700 border-green-300 hover:bg-green-50" onClick={(e) => { e.stopPropagation(); quickAction(todo, "approved"); }}>
              Approve
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-xs text-red-700 border-red-300 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); quickAction(todo, "rejected"); }}>
              Reject
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Task Detail View (admin)
  if (selectedTodo) {
    const sc = statusConfig[selectedTodo.status] || statusConfig.pending;
    const StatusIcon = sc.icon;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedTodo(null)}>
            <ArrowLeft size={16} className="mr-1" /> Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => openEdit(selectedTodo)}>
            Manage Task
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { handleDelete(selectedTodo.id); setSelectedTodo(null); }}>
            <Trash2 size={14} className="mr-1" /> Delete
          </Button>
        </div>

        {/* Task Info */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs font-mono bg-primary/5 text-primary border-primary/20">
                {selectedTodo.event_id}
              </Badge>
              <Badge variant="outline" className={`text-xs ${sc.color}`}>
                <StatusIcon size={10} className="mr-1" />
                {sc.label}
              </Badge>
              {(selectedTodo.urgent || selectedTodo.important) && (
                <Badge variant="outline" className={`text-xs ${selectedTodo.urgent && selectedTodo.important ? "bg-red-100 text-red-700" : selectedTodo.important ? "bg-blue-100 text-blue-700" : selectedTodo.urgent ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                  {selectedTodo.urgent && selectedTodo.important ? "Do First" : selectedTodo.important ? "Schedule" : selectedTodo.urgent ? "Delegate" : "Eliminate"}
                </Badge>
              )}
            </div>
            <h2 className="text-lg font-bold">{selectedTodo.title}</h2>
            {selectedTodo.description && <p className="text-sm text-muted-foreground">{selectedTodo.description}</p>}

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {selectedTodo.submitter && (
                <span className="flex items-center gap-1">
                  <Avatar className="w-4 h-4">
                    {selectedTodo.submitter.photo_url && <AvatarImage src={selectedTodo.submitter.photo_url} />}
                    <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{selectedTodo.submitter.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  Submitted by {selectedTodo.submitter.name}
                </span>
              )}
              {selectedTodo.due_date && (
                <span className="flex items-center gap-1">
                  <CalendarDays size={12} /> Due: {new Date(selectedTodo.due_date).toLocaleDateString("en-IN")}
                </span>
              )}
              {selectedTodo.assignee && <span>Assigned to {selectedTodo.assignee.name}</span>}
              {selectedTodo.assigned_team && (
                <span className="font-medium text-primary">{selectedTodo.assigned_team.icon} {selectedTodo.assigned_team.name}</span>
              )}
            </div>

            {selectedTodo.admin_remarks && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                <span className="font-medium">Admin remarks:</span> {selectedTodo.admin_remarks}
              </div>
            )}

            {/* Commitment Status */}
            {selectedTodo.committer ? (
              <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/50 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock size={14} className="text-indigo-600" />
                    <span className="text-sm font-semibold text-indigo-700">Committed by</span>
                    <Avatar className="w-5 h-5">
                      {selectedTodo.committer.photo_url && <AvatarImage src={selectedTodo.committer.photo_url} />}
                      <AvatarFallback className="text-[8px] bg-indigo-200 text-indigo-700">{selectedTodo.committer.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-indigo-700">{selectedTodo.committer.name}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 gap-1"
                    onClick={() => handleReleaseCommitment(selectedTodo.id)}
                  >
                    <Unlock size={12} /> Release
                  </Button>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-indigo-600">
                  {selectedTodo.committed_at && (
                    <span>{new Date(selectedTodo.committed_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                  )}
                  {selectedTodo.estimated_time && (
                    <span className="flex items-center gap-1"><Timer size={11} /> Est. Time: {selectedTodo.estimated_time}</span>
                  )}
                  {selectedTodo.estimated_amount > 0 && (
                    <span className="flex items-center gap-1"><IndianRupee size={11} /> Est. Amount: ₹{Number(selectedTodo.estimated_amount).toLocaleString("en-IN")}</span>
                  )}
                </div>
              </div>
            ) : (selectedTodo.status === "approved" || selectedTodo.status === "in_progress") && (
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
                    <Card key={st.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openTaskDetail(st)}>
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
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-green-700 hover:bg-green-50" onClick={(e) => { e.stopPropagation(); quickAction(st, "approved"); }}>Approve</Button>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); quickAction(st, "rejected"); }}>Reject</Button>
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

        {/* Edit Task Dialog (admin controls) */}
        <Dialog open={!!editTodo} onOpenChange={() => setEditTodo(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Manage Task {editTodo?.event_id}</DialogTitle>
            </DialogHeader>
            {editTodo && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/30 p-3">
                  <h3 className="font-semibold text-sm">{editTodo.title}</h3>
                  {editTodo.description && <p className="text-xs text-muted-foreground mt-1">{editTodo.description}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    {editTodo.submitter && <span>Submitted by <span className="font-medium">{editTodo.submitter.name}</span></span>}
                    <span>{new Date(editTodo.created_at).toLocaleDateString("en-IN")}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label>Eisenhower Priority</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setEditUrgent(!editUrgent)} className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${editUrgent ? "border-red-400 bg-red-50 text-red-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      <AlertTriangle size={16} /> Urgent
                    </button>
                    <button onClick={() => setEditImportant(!editImportant)} className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${editImportant ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      <Star size={16} /> Important
                    </button>
                  </div>
                  {(editUrgent || editImportant) && (
                    <p className="text-xs text-muted-foreground">
                      Quadrant: <span className="font-semibold">
                        {editUrgent && editImportant ? "Do First" : !editUrgent && editImportant ? "Schedule" : editUrgent && !editImportant ? "Delegate" : "Eliminate"}
                      </span>
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Assign To</Label>
                  <Select value={editAssignedTo} onValueChange={setEditAssignedTo}>
                    <SelectTrigger><SelectValue placeholder="Select member or team" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {teams.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Teams</div>
                          {teams.map((t) => (
                            <SelectItem key={`team:${t.id}`} value={`team:${t.id}`}>{t.icon ? `${t.icon} ` : ""}{t.name}</SelectItem>
                          ))}
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Members</div>
                        </>
                      )}
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Admin Remarks</Label>
                  <Textarea placeholder="Add remarks or instructions..." value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} rows={2} />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setEditTodo(null)}>Cancel</Button>
                  <Button onClick={handleUpdate} disabled={saving}>
                    {saving ? "Saving..." : "Update Task"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Main view (list or matrix)
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Eisenhower Matrix</h1>
        <div className="flex items-center gap-2">
          <Button variant={viewMode === "list" ? "default" : "outline"} size="sm" onClick={() => setViewMode("list")} className="gap-1.5">
            <List size={14} /> List
          </Button>
          <Button variant={viewMode === "matrix" ? "default" : "outline"} size="sm" onClick={() => setViewMode("matrix")} className="gap-1.5">
            <LayoutGrid size={14} /> Matrix
          </Button>
        </div>
      </div>

      {viewMode === "list" ? (
        <>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search tasks or Event ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const count = tab.key === "all" ? todos.length : todos.filter((t) => t.status === tab.key).length;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === tab.key ? "bg-primary text-primary-foreground shadow-sm" : "bg-card border hover:bg-accent/50 text-foreground"}`}>
                  {tab.label}
                  <span className="ml-2 text-xs opacity-70">({count})</span>
                </button>
              );
            })}
          </div>

          {filtered.length > 0 ? (
            <div className="space-y-3">
              {filtered.map((todo) => (
                <div key={todo.id} className="flex items-start gap-2">
                  <div className="flex-1"><TodoCard todo={todo} /></div>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive shrink-0 mt-2" onClick={() => handleDelete(todo.id)}>
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <ListTodo className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No tasks found.</p>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Click a task to view details, sub-tasks, notes, and deliverables. Only approved/in-progress/completed tasks appear here.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quadrants.map((q) => {
              const QuadIcon = q.icon;
              const qTodos = matrixTodos.filter((t) => t.urgent === q.urgent && t.important === q.important);
              return (
                <Card key={q.label} className={`${q.color} min-h-[200px]`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <div className={`rounded-lg p-1.5 ${q.headerColor}`}><QuadIcon size={14} /></div>
                      <div>
                        <span className="font-bold">{q.label}</span>
                        <span className="text-xs text-muted-foreground ml-2 font-normal">{q.subtitle}</span>
                      </div>
                      <Badge variant="outline" className="ml-auto text-xs">{qTodos.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {qTodos.length > 0 ? (
                      qTodos.map((todo) => <TodoCard key={todo.id} todo={todo} compact />)
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-6">No tasks</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
