"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SectionTabs, SectionTabsContent } from "@/components/section-tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Plus, Trash2, Lock, UserCheck, CheckSquare, ArrowUp, ArrowRight, ArrowDown,
  AlertTriangle, Calendar, Clock, Pencil, ChevronDown, ChevronUp,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface AdminTask {
  id: string;
  title: string;
  description: string | null;
  type: "internal" | "assigned" | "checklist";
  status: string;
  priority: string;
  assigned_to: string | null;
  assigned_team_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  remarks: string | null;
  created_at: string;
  assigned_user?: { name: string } | null;
  assigned_team?: { name: string } | null;
}

interface User { id: string; name: string; }
interface Team { id: string; name: string; }

const PRIORITY_CONFIG = {
  urgent: { label: "Urgent", icon: AlertTriangle, color: "text-red-700 bg-red-50", border: "border-l-red-600" },
  high: { label: "High", icon: ArrowUp, color: "text-red-600 bg-red-50", border: "border-l-red-500" },
  medium: { label: "Medium", icon: ArrowRight, color: "text-amber-600 bg-amber-50", border: "border-l-amber-500" },
  low: { label: "Low", icon: ArrowDown, color: "text-blue-600 bg-blue-50", border: "border-l-blue-500" },
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
};

export default function SpecialTasksPage() {
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [tab, setTab] = useState<"internal" | "assigned" | "checklist">("internal");
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<AdminTask | null>(null);
  const [form, setForm] = useState({
    title: "", description: "", type: "internal" as string,
    priority: "medium", assigned_to: "", assigned_team_id: "", due_date: "",
  });

  function load() {
    fetch("/api/admin-tasks")
      .then((r) => r.json())
      .then((d) => setTasks(d.tasks || []))
      .catch(() => toast.error("Failed to load tasks"));
  }

  useEffect(() => {
    load();
    fetch("/api/users?status=approved")
      .then((r) => r.json())
      .then((d) => setUsers((d.users || []).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name }))))
      .catch(() => {});
    fetch("/api/teams")
      .then((r) => r.json())
      .then((d) => setTeams((d.teams || []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => tasks.filter((t) => t.type === tab), [tasks, tab]);

  const stats = useMemo(() => {
    const byType = (type: string) => tasks.filter((t) => t.type === type);
    return {
      internal: byType("internal").length,
      assigned: byType("assigned").length,
      checklist: byType("checklist").length,
      pending: tasks.filter((t) => t.status === "pending").length,
      completed: tasks.filter((t) => t.status === "completed").length,
    };
  }, [tasks]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    const res = await fetch("/api/admin-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        type: tab === "checklist" ? "checklist" : form.type,
        assigned_to: form.assigned_to || null,
        assigned_team_id: form.assigned_team_id || null,
        due_date: form.due_date || null,
      }),
    });
    if (res.ok) {
      toast.success("Task created");
      setForm({ title: "", description: "", type: tab, priority: "medium", assigned_to: "", assigned_team_id: "", due_date: "" });
      setCreateOpen(false);
      load();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to create");
    }
  }

  async function handleUpdate(id: string, updates: Record<string, unknown>) {
    const res = await fetch("/api/admin-tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    if (res.ok) {
      load();
    } else {
      toast.error("Update failed");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this task?")) return;
    const res = await fetch(`/api/admin-tasks?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      load();
    }
  }

  async function handleEditSave() {
    if (!editTask) return;
    await handleUpdate(editTask.id, {
      title: editTask.title,
      description: editTask.description,
      priority: editTask.priority,
      assigned_to: editTask.assigned_to,
      assigned_team_id: editTask.assigned_team_id,
      due_date: editTask.due_date,
      remarks: editTask.remarks,
    });
    setEditTask(null);
    toast.success("Task updated");
  }

  function toggleChecklistItem(task: AdminTask) {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    handleUpdate(task.id, { status: newStatus });
  }

  function getDaysBadge(dueDate: string | null, status: string) {
    if (!dueDate || status === "completed" || status === "cancelled") return null;
    const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">{Math.abs(days)}d overdue</span>;
    if (days === 0) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">Due today</span>;
    if (days <= 3) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">{days}d left</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">{days}d left</span>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Special Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {stats.pending} pending, {stats.completed} completed out of {tasks.length} tasks
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-1" />New Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Special Task</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Task title" required className="mt-1" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Details..." rows={3} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal (Private)</SelectItem>
                      <SelectItem value="assigned">Assigned to Member/Team</SelectItem>
                      <SelectItem value="checklist">Checklist Item</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.type === "assigned" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Assign to Member</Label>
                    <Select value={form.assigned_to || "none"} onValueChange={(v) => setForm({ ...form, assigned_to: v === "none" ? "" : v })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select member" /></SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        <SelectItem value="none">None</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Assign to Team</Label>
                    <Select value={form.assigned_team_id || "none"} onValueChange={(v) => setForm({ ...form, assigned_team_id: v === "none" ? "" : v })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select team" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {teams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="mt-1" />
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90">Create Task</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <SectionTabs
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        aria-label="Special tasks sections"
        tabs={[
          { value: "internal", label: "Internal", icon: Lock, count: stats.internal },
          { value: "assigned", label: "Assigned", icon: UserCheck, count: stats.assigned },
          { value: "checklist", label: "Checklist", icon: CheckSquare, count: stats.checklist },
        ]}
      >
        <SectionTabsContent value={tab} className="mt-4">
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <p className="text-muted-foreground">
                  No {tab === "internal" ? "internal" : tab === "assigned" ? "assigned" : "checklist"} tasks yet
                </p>
              </CardContent>
            </Card>
          ) : tab === "checklist" ? (
            /* Checklist view */
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  {filtered.map((task) => (
                    <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 group">
                      <Checkbox
                        checked={task.status === "completed"}
                        onCheckedChange={() => toggleChecklistItem(task)}
                        className="h-5 w-5"
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                          {task.title}
                        </span>
                        {task.due_date && (
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            <Calendar size={9} className="inline mr-0.5" />{formatDate(task.due_date)}
                          </span>
                        )}
                        {getDaysBadge(task.due_date, task.status)}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditTask(task)}>
                          <Pencil size={12} />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(task.id)}>
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Internal / Assigned view */
            <div className="space-y-3">
              {filtered.map((task) => {
                const pri = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;
                const PriIcon = pri.icon;
                return (
                  <Card key={task.id} className={`border-l-4 ${pri.border}`}>
                    <CardContent className="pt-4">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className={`font-medium text-sm ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                              {task.title}
                            </h3>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[task.status] || ""}`}>
                              {task.status.replace("_", " ")}
                            </span>
                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${pri.color}`}>
                              <PriIcon size={9} />{pri.label}
                            </span>
                            {getDaysBadge(task.due_date, task.status)}
                          </div>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span>{formatDate(task.created_at)}</span>
                            {task.due_date && <span className="flex items-center gap-0.5"><Calendar size={10} />Due: {formatDate(task.due_date)}</span>}
                            {task.assigned_user?.name && <span className="flex items-center gap-0.5"><UserCheck size={10} />{task.assigned_user.name}</span>}
                            {task.assigned_team?.name && <Badge variant="outline" className="text-[10px] py-0">{task.assigned_team.name}</Badge>}
                          </div>
                          {task.remarks && (
                            <div className="mt-2 p-2 bg-muted/50 rounded-lg border-l-2 border-l-primary/30">
                              <p className="text-xs">{task.remarks}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Select value={task.status} onValueChange={(v) => handleUpdate(task.id, { status: v })}>
                            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditTask(task)}>
                            <Pencil size={14} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => handleDelete(task.id)}>
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
        </SectionTabsContent>
      </SectionTabs>

      {/* Edit Dialog */}
      <Dialog open={!!editTask} onOpenChange={(v) => !v && setEditTask(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          {editTask && (
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={editTask.title} onChange={(e) => setEditTask({ ...editTask, title: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={editTask.description || ""} onChange={(e) => setEditTask({ ...editTask, description: e.target.value })} rows={3} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Priority</Label>
                  <Select value={editTask.priority} onValueChange={(v) => setEditTask({ ...editTask, priority: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input type="date" value={editTask.due_date || ""} onChange={(e) => setEditTask({ ...editTask, due_date: e.target.value })} className="mt-1" />
                </div>
              </div>
              {editTask.type === "assigned" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Assign to Member</Label>
                    <Select value={editTask.assigned_to || "none"} onValueChange={(v) => setEditTask({ ...editTask, assigned_to: v === "none" ? null : v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        <SelectItem value="none">None</SelectItem>
                        {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Assign to Team</Label>
                    <Select value={editTask.assigned_team_id || "none"} onValueChange={(v) => setEditTask({ ...editTask, assigned_team_id: v === "none" ? null : v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div>
                <Label>Remarks</Label>
                <Textarea value={editTask.remarks || ""} onChange={(e) => setEditTask({ ...editTask, remarks: e.target.value })} rows={2} className="mt-1" />
              </div>
              <Button onClick={handleEditSave} className="w-full bg-primary hover:bg-primary/90">Save Changes</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
