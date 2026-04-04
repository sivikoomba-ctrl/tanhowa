"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Star, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Todo, Member, Team } from "./types";

interface EditTaskDialogProps {
  todo: Todo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  teams: Team[];
  onSave: () => void;
}

export default function EditTaskDialog({ todo, open, onOpenChange, members, teams, onSave }: EditTaskDialogProps) {
  const [editStatus, setEditStatus] = useState("");
  const [editUrgent, setEditUrgent] = useState(false);
  const [editImportant, setEditImportant] = useState(false);
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    if (todo) {
      setEditStatus(todo.status);
      setEditUrgent(todo.urgent);
      setEditImportant(todo.important);
      setEditAssignedTo(todo.assigned_team_id ? `team:${todo.assigned_team_id}` : todo.assigned_to || "none");
      setEditRemarks(todo.admin_remarks);
      setEditDueDate(todo.due_date || "");
    }
  }, [todo]);

  async function suggestTeam() {
    if (!todo) return;
    setSuggesting(true);
    try {
      const res = await fetch("/api/todos/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest", title: todo.title, description: todo.description || "" }),
      });
      const data = await res.json();
      if (data.suggestion) {
        setEditAssignedTo(`team:${data.suggestion.team_id}`);
        toast.success(`Suggested: ${data.suggestion.team_name} (${Math.round(data.suggestion.confidence * 100)}%)`);
      } else {
        toast.info("No clear team match found");
      }
    } catch {
      toast.error("Failed to get suggestion");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleUpdate() {
    if (!todo) return;
    setSaving(true);
    try {
      const res = await fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: todo.id,
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
      onOpenChange(false);
      onSave();
    } catch {
      toast.error("Failed to update task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Task {todo?.event_id}</DialogTitle>
        </DialogHeader>
        {todo && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/30 p-3">
              <h3 className="font-semibold text-sm">{todo.title}</h3>
              {todo.description && <p className="text-xs text-muted-foreground mt-1">{todo.description}</p>}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                {todo.submitter && <span>Submitted by <span className="font-medium">{todo.submitter.name}</span></span>}
                <span>{new Date(todo.created_at).toLocaleDateString("en-IN")}</span>
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
              <div className="flex items-center justify-between">
                <Label>Assign To</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={suggestTeam}
                  disabled={suggesting}
                  className="h-7 gap-1 text-xs text-primary"
                >
                  {suggesting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {suggesting ? "Analyzing..." : "AI Suggest"}
                </Button>
              </div>
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
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={saving}>
                {saving ? "Saving..." : "Update Task"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
