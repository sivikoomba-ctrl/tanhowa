"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sprout, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  /** Days since the user was last active. Modal fires when >= 14. */
  daysInactive: number | null;
}

const REASON_OPTIONS = [
  { value: "busy_work", label: "Busy with field work" },
  { value: "not_useful", label: "Didn't find it useful enough" },
  { value: "tech_issues", label: "Technical issues / didn't load properly" },
  { value: "didnt_know", label: "Didn't know what to do here" },
  { value: "other", label: "Other (please share below)" },
];

export function ReEngagementModal({ daysInactive }: Props) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (checked) return;
    if (daysInactive == null || daysInactive < 14) {
      setChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/feedback");
        if (!res.ok) return;
        const data = await res.json();
        const seen = (data.prompts || []).some(
          (p: { kind: string }) => p.kind === "re_engagement",
        );
        if (!seen && !cancelled) setOpen(true);
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [daysInactive, checked]);

  async function dismiss() {
    setOpen(false);
    try {
      await fetch("/api/feedback/dismiss", { method: "POST" });
    } catch {
      // ignore — we'll just risk showing it once more
    }
  }

  async function submit() {
    if (!reason && comment.trim().length === 0) {
      toast.error("Pick a reason or write a comment");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "re_engagement",
          reason,
          comment: comment.trim() || null,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to send");
        return;
      }
      toast.success("Thank you — we'll work on it.");
      setOpen(false);
    } catch {
      toast.error("Failed to send");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sprout className="w-5 h-5 text-primary" />
            Welcome back!
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            We missed you. To help us serve members better — what kept you away?
          </p>
          <div className="space-y-2">
            {REASON_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                  reason === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-input hover:bg-muted/50"
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={opt.value}
                  checked={reason === opt.value}
                  onChange={() => setReason(opt.value)}
                  className="accent-primary"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Anything else you'd like to share? (optional)"
            rows={3}
            maxLength={4000}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={dismiss} disabled={saving}>
            Skip
          </Button>
          <Button onClick={submit} disabled={saving || (!reason && !comment.trim())}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {saving ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
