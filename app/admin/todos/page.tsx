"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Search,
  GitBranch,
  Lock,
  Timer,
  IndianRupee,
  Pencil,
  Copy,
  CheckSquare,
  Square,
  Plus,
  Sparkles,
  Loader2,
  Trophy,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { GamificationPanel } from "@/components/gamification-panel";
import type { Todo, TodoNote, TodoAttachment, TodoVoucher, Member, Team, TimeEntry } from "./_components/types";
import TodoDetailView from "./_components/TodoDetailView";
import EditTaskDialog from "./_components/EditTaskDialog";
import CreateTaskDialog from "./_components/CreateTaskDialog";

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800", icon: Clock },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-800", icon: CheckCircle2 },
  in_progress: { label: "In Progress", color: "bg-indigo-100 text-indigo-800", icon: Zap },
  review: { label: "Under Review", color: "bg-purple-100 text-purple-800", icon: Clock },
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
  const [showRewards, setShowRewards] = useState(true);
  const [search, setSearch] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Task detail view
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [subtasks, setSubtasks] = useState<Todo[]>([]);
  const [notes, setNotes] = useState<TodoNote[]>([]);
  const [attachments, setAttachments] = useState<TodoAttachment[]>([]);
  const [vouchers, setVouchers] = useState<TodoVoucher[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Time entries
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [timeEntryTotalHours, setTimeEntryTotalHours] = useState(0);
  const [timeEntryContributors, setTimeEntryContributors] = useState(0);

  // Edit dialog
  const [editTodo, setEditTodo] = useState<Todo | null>(null);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);

  // Bulk classify
  const [classifying, setClassifying] = useState(false);

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

  async function fetchTimeEntries(todoId: string) {
    try {
      const res = await fetch(`/api/todos/time-entries?todo_id=${todoId}`);
      const data = await res.json();
      setTimeEntries(data.entries || []);
      setTimeEntryTotalHours(data.totalHours || 0);
      setTimeEntryContributors(data.contributors || 0);
    } catch { /* silent */ }
  }

  async function openTaskDetail(todo: Todo) {
    setSelectedTodo(todo);
    setLoadingDetail(true);

    try {
      const [subtasksRes, notesRes, attachmentsRes, vouchersRes] = await Promise.all([
        fetch(`/api/todos?parent_id=${todo.id}`).then((r) => r.json()),
        fetch(`/api/todos/notes?todo_id=${todo.id}`).then((r) => r.json()),
        fetch(`/api/todos/attachments?todo_id=${todo.id}`).then((r) => r.json()),
        fetch(`/api/todos/vouchers?todo_id=${todo.id}`).then((r) => r.json()),
      ]);
      fetchTimeEntries(todo.id);
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
  }

  async function handleUpdateTodo(id: string, updates: Record<string, unknown>) {
    try {
      const res = await fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Updated");
      fetchData();
    } catch {
      toast.error("Failed to update");
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

  function toggleSelectTask(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleClone(id: string) {
    try {
      const res = await fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "clone" }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      toast.success(`Task cloned as ${data.todo.event_id}`);
      fetchData();
    } catch {
      toast.error("Failed to clone task");
    }
  }

  async function bulkClassify() {
    const unassignedCount = todos.filter((t) => !t.assigned_team_id && !t.assigned_to && !["completed", "rejected", "cancelled"].includes(t.status)).length;
    if (unassignedCount === 0) {
      toast.info("No unassigned tasks to classify");
      return;
    }
    if (!confirm(`Use AI to classify ${unassignedCount} unassigned tasks to teams?`)) return;
    setClassifying(true);
    try {
      const res = await fetch("/api/todos/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Classified ${data.classified} tasks. ${data.skipped} skipped (low confidence).`);
        fetchData();
      } else {
        toast.error(data.error || "Classification failed");
      }
    } catch {
      toast.error("Classification failed");
    } finally {
      setClassifying(false);
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
    { key: "review", label: "Review" },
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
    const quadrantBorder = (todo.urgent || todo.important) ? (todo.urgent && todo.important ? "border-l-red-500" : !todo.urgent && todo.important ? "border-l-blue-500" : todo.urgent && !todo.important ? "border-l-amber-500" : "border-l-gray-400") : "";
    const borderColor = quadrantBorder || (todo.status === "completed" ? "border-l-green-500" : todo.status === "in_progress" ? "border-l-blue-500" : todo.status === "approved" ? "border-l-primary" : todo.status === "rejected" ? "border-l-red-400" : "border-l-amber-400");
    return (
      <div
        className={`rounded-xl border border-l-4 ${borderColor} bg-white p-3 hover:shadow-md transition-shadow cursor-pointer ${compact ? "text-xs" : ""}`}
        onClick={() => openTaskDetail(todo)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Badge variant="outline" className="text-[9px] font-mono bg-primary/5 text-primary border-primary/20 shrink-0">
              {todo.event_id}
            </Badge>
            <h4 className={`font-medium ${compact ? "text-xs" : "text-sm"} line-clamp-1`}>{todo.title}</h4>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
              onClick={(e) => { e.stopPropagation(); handleClone(todo.id); }}
              title="Clone task"
            >
              <Copy size={12} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
              onClick={(e) => { e.stopPropagation(); openEdit(todo); }}
            >
              <Pencil size={12} />
            </Button>
            <button
              className="text-muted-foreground hover:text-primary"
              onClick={(e) => { e.stopPropagation(); toggleSelectTask(todo.id); }}
            >
              {selectedIds.has(todo.id) ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
            </button>
            <Badge variant="outline" className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
          </div>
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
              {todo.subtask_completed}/{todo.subtask_count}
            </span>
          )}
        </div>
        {todo.subtask_count > 0 && (
          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex-1 h-2.5 rounded-full bg-muted/80 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  todo.subtask_completed === todo.subtask_count
                    ? "bg-gradient-to-r from-green-400 to-green-600"
                    : todo.subtask_completed > 0
                      ? "bg-gradient-to-r from-primary/70 to-primary"
                      : "bg-muted-foreground/20"
                }`}
                style={{ width: `${Math.max((todo.subtask_completed / todo.subtask_count) * 100, todo.subtask_completed > 0 ? 5 : 0)}%` }}
              />
            </div>
            <span className={`text-[11px] font-medium ${todo.subtask_completed === todo.subtask_count ? "text-green-600" : "text-muted-foreground"}`}>
              {todo.subtask_completed}/{todo.subtask_count}
            </span>
          </div>
        )}
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
    return (
      <>
        <TodoDetailView
          todo={selectedTodo}
          subtasks={subtasks}
          notes={notes}
          attachments={attachments}
          vouchers={vouchers}
          timeEntries={timeEntries}
          timeEntryTotalHours={timeEntryTotalHours}
          timeEntryContributors={timeEntryContributors}
          loadingDetail={loadingDetail}
          members={members}
          teams={teams}
          onBack={() => setSelectedTodo(null)}
          onRefresh={openTaskDetail}
          onEdit={openEdit}
          onOpenSubtask={openTaskDetail}
          onQuickAction={quickAction}
          onUpdateTodo={handleUpdateTodo}
          onDelete={handleDelete}
          onFetchData={fetchData}
          onFetchTimeEntries={fetchTimeEntries}
          onSetSubtasks={setSubtasks}
          onSetNotes={setNotes}
          onSetAttachments={setAttachments}
          onSetVouchers={setVouchers}
          onSetSelectedTodo={setSelectedTodo}
        />
        <EditTaskDialog
          todo={editTodo}
          open={!!editTodo}
          onOpenChange={(open) => { if (!open) setEditTodo(null); }}
          members={members}
          teams={teams}
          onSave={() => { setEditTodo(null); fetchData(); if (selectedTodo) openTaskDetail(selectedTodo); }}
        />
      </>
    );
  }

  // Main view (list or matrix)
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Task List</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={bulkClassify} disabled={classifying}>
            {classifying ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {classifying ? "Classifying..." : "AI Classify"}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Create Task
          </Button>
          <Button variant={viewMode === "list" ? "default" : "outline"} size="sm" onClick={() => setViewMode("list")} className="gap-1.5">
            <List size={14} /> List
          </Button>
          <Button variant={viewMode === "matrix" ? "default" : "outline"} size="sm" onClick={() => setViewMode("matrix")} className="gap-1.5">
            <LayoutGrid size={14} /> Matrix
          </Button>
          <Button
            variant={showRewards ? "default" : "outline"}
            size="sm"
            onClick={() => setShowRewards((v) => !v)}
            className="gap-1.5"
            title="Rewards & leaderboard"
          >
            <Trophy size={14} className={showRewards ? "" : "text-amber-500"} /> Rewards
            <ChevronDown size={14} className={`transition-transform ${showRewards ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Rewards & leaderboard (collapsible — shared with /dashboard/rewards) */}
      {showRewards && (
        <div className="rounded-2xl border bg-muted/20 p-4">
          <GamificationPanel showHeading={false} />
        </div>
      )}

      {/* Create Task Dialog */}
      <CreateTaskDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={fetchData}
      />

      {/* Edit Task Dialog */}
      <EditTaskDialog
        todo={editTodo}
        open={!!editTodo}
        onOpenChange={(open) => { if (!open) setEditTodo(null); }}
        members={members}
        teams={teams}
        onSave={() => { setEditTodo(null); fetchData(); }}
      />

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
