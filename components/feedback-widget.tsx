"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { MessageCircle, Star, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SUBMITTED_KEY = "tanhowa-feedback-cooldown-until";
const COOLDOWN_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [hideButton, setHideButton] = useState(false);

  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(SUBMITTED_KEY) || "0");
      if (until && Date.now() < until) setHideButton(true);
    } catch {
      // localStorage unavailable
    }
  }, []);

  async function submit() {
    if (rating == null && comment.trim().length === 0) {
      toast.error("Pick a rating or write a comment");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "widget",
          rating,
          comment: comment.trim() || null,
          page_url: pathname || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to send");
        return;
      }
      toast.success("Thank you — feedback received.");
      setOpen(false);
      setRating(null);
      setComment("");
      try {
        localStorage.setItem(SUBMITTED_KEY, String(Date.now() + COOLDOWN_MS));
        setHideButton(true);
      } catch {
        // ignore
      }
    } catch {
      toast.error("Failed to send");
    } finally {
      setSaving(false);
    }
  }

  if (hideButton && !open) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-6 z-40 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        aria-label="Send feedback"
      >
        <MessageCircle className="w-4 h-4" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              How is the portal working for you? Your feedback goes straight to the State-Admin.
            </p>
            <div className="flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => {
                const active = (hoverRating ?? rating ?? 0) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(null)}
                    className="p-1"
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  >
                    <Star
                      className={`w-7 h-7 transition-colors ${
                        active ? "text-amber-400 fill-amber-400" : "text-muted-foreground/40"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What's working well? What would you like to see changed? (optional)"
              rows={4}
              maxLength={4000}
            />
            <p className="text-[11px] text-muted-foreground text-right">{comment.length}/4000</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {saving ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
