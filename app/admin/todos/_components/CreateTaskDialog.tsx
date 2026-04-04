"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Star } from "lucide-react";
import { toast } from "sonner";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export default function CreateTaskDialog({ open, onOpenChange, onCreated }: CreateTaskDialogProps) {
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createDueDate, setCreateDueDate] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [important, setImportant] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleCreateTask() {
    if (!createTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createTitle.trim(),
          description: createDescription.trim(),
          due_date: createDueDate || null,
          urgent,
          important,
        }),
      });
      if (!res.ok) throw new Error("Failed to create task");
      toast.success("Task created");
      onOpenChange(false);
      setCreateTitle("");
      setCreateDescription("");
      setCreateDueDate("");
      setUrgent(false);
      setImportant(true);
      onCreated();
    } catch {
      toast.error("Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input placeholder="What needs to be done?" value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea placeholder="Provide details..." value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Due Date (optional)</Label>
            <Input type="date" value={createDueDate} onChange={(e) => setCreateDueDate(e.target.value)} />
          </div>
          <div className="space-y-3">
            <Label>Eisenhower Priority</Label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setUrgent(!urgent)} className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${urgent ? "border-red-400 bg-red-50 text-red-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                <AlertTriangle size={16} /> Urgent
              </button>
              <button type="button" onClick={() => setImportant(!important)} className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${important ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                <Star size={16} /> Important
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Quadrant: <span className="font-semibold">
                {urgent && important ? "Do First" : !urgent && important ? "Schedule" : urgent && !important ? "Delegate" : "Eliminate"}
              </span>
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleCreateTask} disabled={saving || !createTitle.trim()}>
              {saving ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
