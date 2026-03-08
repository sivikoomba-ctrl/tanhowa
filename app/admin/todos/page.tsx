"use client";

import { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

interface TodoUser {
  id: string;
  name: string;
  photo_url: string;
  occupation: string;
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
  submitter: TodoUser | null;
  assignee: TodoUser | null;
  assigned_team: Team | null;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
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
  const [viewMode, setViewMode] = useState<"list" | "matrix">("list");
  const [editTodo, setEditTodo] = useState<Todo | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editUrgent, setEditUrgent] = useState(false);
  const [editImportant, setEditImportant] = useState(false);
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  async function fetchData() {
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
  }

  useEffect(() => {
    fetchData();
  }, []);

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
          t.submitter?.name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [todos, activeTab, search]);

  // For matrix view, only show non-pending/non-rejected tasks
  const matrixTodos = useMemo(() => {
    return todos.filter((t) => t.status !== "pending" && t.status !== "rejected");
  }, [todos]);

  function TodoCard({ todo, compact }: { todo: Todo; compact?: boolean }) {
    const sc = statusConfig[todo.status] || statusConfig.pending;
    return (
      <div
        className={`rounded-xl border bg-white p-3 hover:shadow-md transition-shadow cursor-pointer ${compact ? "text-xs" : ""}`}
        onClick={() => openEdit(todo)}
      >
        <div className="flex items-start justify-between gap-2">
          <h4 className={`font-medium ${compact ? "text-xs" : "text-sm"} line-clamp-2`}>{todo.title}</h4>
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
          {todo.due_date && (
            <span className="flex items-center gap-0.5">
              <CalendarDays size={10} />
              {new Date(todo.due_date).toLocaleDateString("en-IN")}
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">To-Do List</h1>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="gap-1.5"
          >
            <List size={14} />
            List
          </Button>
          <Button
            variant={viewMode === "matrix" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("matrix")}
            className="gap-1.5"
          >
            <LayoutGrid size={14} />
            Matrix
          </Button>
        </div>
      </div>

      {viewMode === "list" ? (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
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
              {filtered.map((todo) => (
                <div key={todo.id} className="flex items-start gap-2">
                  <div className="flex-1">
                    <TodoCard todo={todo} />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive shrink-0 mt-2"
                    onClick={() => handleDelete(todo.id)}
                  >
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
        /* Eisenhower Matrix View */
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Drag tasks from the list view or click to edit and set priority. Only approved/in-progress/completed tasks appear here.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quadrants.map((q) => {
              const QuadIcon = q.icon;
              const qTodos = matrixTodos.filter((t) => t.urgent === q.urgent && t.important === q.important);
              return (
                <Card key={q.label} className={`${q.color} min-h-[200px]`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <div className={`rounded-lg p-1.5 ${q.headerColor}`}>
                        <QuadIcon size={14} />
                      </div>
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

      {/* Edit Task Dialog */}
      <Dialog open={!!editTodo} onOpenChange={() => setEditTodo(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Task</DialogTitle>
          </DialogHeader>
          {editTodo && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-3">
                <h3 className="font-semibold text-sm">{editTodo.title}</h3>
                {editTodo.description && (
                  <p className="text-xs text-muted-foreground mt-1">{editTodo.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  {editTodo.submitter && (
                    <span className="flex items-center gap-1">
                      Submitted by <span className="font-medium">{editTodo.submitter.name}</span>
                    </span>
                  )}
                  <span>{new Date(editTodo.created_at).toLocaleDateString("en-IN")}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                  <button
                    onClick={() => setEditUrgent(!editUrgent)}
                    className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${
                      editUrgent ? "border-red-400 bg-red-50 text-red-700" : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    <AlertTriangle size={16} />
                    Urgent
                  </button>
                  <button
                    onClick={() => setEditImportant(!editImportant)}
                    className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${
                      editImportant ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    <Star size={16} />
                    Important
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
                  <SelectTrigger>
                    <SelectValue placeholder="Select member or team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {teams.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Teams</div>
                        {teams.map((t) => (
                          <SelectItem key={`team:${t.id}`} value={`team:${t.id}`}>
                            {t.icon ? `${t.icon} ` : ""}{t.name}
                          </SelectItem>
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
                <Input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Admin Remarks</Label>
                <Textarea
                  placeholder="Add remarks or instructions..."
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  rows={2}
                />
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
