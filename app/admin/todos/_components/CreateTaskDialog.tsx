"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Star, Sparkles, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface TeamSuggestion {
  team_id: string;
  team_name: string;
  confidence: number;
  reason: string;
}

export default function CreateTaskDialog({ open, onOpenChange, onCreated }: CreateTaskDialogProps) {
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createDueDate, setCreateDueDate] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [important, setImportant] = useState(true);
  const [saving, setSaving] = useState(false);

  // AI team suggestion
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<TeamSuggestion | null>(null);
  const [acceptedTeam, setAcceptedTeam] = useState<{ id: string; name: string } | null>(null);

  async function suggestTeam() {
    if (!createTitle.trim()) {
      toast.error("Enter a title first");
      return;
    }
    setSuggesting(true);
    setSuggestion(null);
    try {
      const res = await fetch("/api/todos/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest", title: createTitle.trim(), description: createDescription.trim() }),
      });
      const data = await res.json();
      if (data.suggestion) {
        setSuggestion(data.suggestion);
      } else {
        toast.info("No clear team match found for this task");
      }
    } catch {
      toast.error("Failed to get suggestion");
    } finally {
      setSuggesting(false);
    }
  }

  function acceptSuggestion() {
    if (suggestion) {
      setAcceptedTeam({ id: suggestion.team_id, name: suggestion.team_name });
      setSuggestion(null);
    }
  }

  function dismissSuggestion() {
    setSuggestion(null);
  }

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
          assigned_team_id: acceptedTeam?.id || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create task");
      toast.success(acceptedTeam ? `Task created & assigned to ${acceptedTeam.name}` : "Task created");
      onOpenChange(false);
      setCreateTitle("");
      setCreateDescription("");
      setCreateDueDate("");
      setUrgent(false);
      setImportant(true);
      setSuggestion(null);
      setAcceptedTeam(null);
      onCreated();
    } catch {
      toast.error("Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setSuggestion(null); setAcceptedTeam(null); } }}>
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

          {/* AI Team Suggestion */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Team Assignment</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={suggestTeam}
                disabled={suggesting || !createTitle.trim()}
                className="h-7 gap-1 text-xs text-primary"
              >
                {suggesting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {suggesting ? "Analyzing..." : "AI Suggest"}
              </Button>
            </div>

            {/* Suggestion banner */}
            {suggestion && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <Sparkles size={14} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{suggestion.team_name}</p>
                  <p className="text-xs text-muted-foreground">{Math.round(suggestion.confidence * 100)}% confidence &middot; {suggestion.reason}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={acceptSuggestion} className="h-7 w-7 p-0 text-green-600 hover:bg-green-50">
                  <Check size={14} />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={dismissSuggestion} className="h-7 w-7 p-0 text-muted-foreground hover:bg-red-50">
                  <X size={14} />
                </Button>
              </div>
            )}

            {/* Accepted team badge */}
            {acceptedTeam && !suggestion && (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                <Check size={14} className="text-green-600 shrink-0" />
                <span className="text-sm font-medium text-green-700">{acceptedTeam.name}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setAcceptedTeam(null)} className="h-6 w-6 p-0 ml-auto text-muted-foreground">
                  <X size={12} />
                </Button>
              </div>
            )}
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
