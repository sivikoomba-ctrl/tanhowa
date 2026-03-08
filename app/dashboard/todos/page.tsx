"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

interface TodoUser {
  id: string;
  name: string;
  photo_url: string;
  occupation: string;
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
  submitter: TodoUser | null;
  assignee: TodoUser | null;
  assigned_team: TodoTeam | null;
  created_at: string;
  completed_at: string | null;
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

  async function fetchTodos() {
    try {
      const res = await fetch("/api/todos");
      const data = await res.json();
      setTodos(data.todos || []);
    } catch {
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTodos();
  }, []);

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
        }),
      });

      if (!res.ok) throw new Error("Failed to create");
      toast.success("Task submitted for approval");
      setShowCreate(false);
      setFormTitle("");
      setFormDescription("");
      setFormDueDate("");
      fetchTodos();
    } catch {
      toast.error("Failed to submit task");
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

  const filtered = activeTab === "all" ? todos : todos.filter((t) => t.status === activeTab);

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
        <Button onClick={() => setShowCreate(true)} className="gap-2">
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
              <Card key={todo.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <StatusIcon size={18} className={todo.status === "completed" ? "text-green-600" : todo.status === "rejected" ? "text-red-500" : "text-amber-500"} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm">{todo.title}</h3>
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
                        <span>
                          {new Date(todo.created_at).toLocaleDateString("en-IN")}
                        </span>
                      </div>

                      {todo.admin_remarks && (
                        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                          <span className="font-medium">Admin remarks:</span> {todo.admin_remarks}
                        </div>
                      )}

                      {todo.urgent && (
                        <div className="flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle size={12} /> Urgent
                        </div>
                      )}
                      {todo.important && (
                        <div className="flex items-center gap-1 text-xs text-blue-600">
                          <Star size={12} /> Important
                        </div>
                      )}
                    </div>
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
