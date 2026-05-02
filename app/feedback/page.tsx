"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sprout, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const REASON_OPTIONS = [
  { value: "busy_work", label: "Busy with field work" },
  { value: "not_useful", label: "Didn't find it useful enough" },
  { value: "tech_issues", label: "Technical issues / didn't load properly" },
  { value: "didnt_know", label: "Didn't know what to do here" },
  { value: "other", label: "Other (please share below)" },
];

function FeedbackInner() {
  const params = useSearchParams();
  const token = params.get("t");
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) setError("This link is missing its token. Please use the link from your email.");
  }, [token]);

  async function submit() {
    if (!token) return;
    if (!reason && comment.trim().length === 0) {
      setError("Pick a reason or write a comment");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "inactive_email",
          token,
          reason,
          comment: comment.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to send");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Failed to send");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sprout className="w-5 h-5 text-primary" />
            TANHOWA Feedback
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {submitted ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-3" />
              <h3 className="font-semibold mb-1">Thank you</h3>
              <p className="text-sm text-muted-foreground">
                Your feedback has been received. The State-Admin will review it soon.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                We noticed you haven&apos;t visited in a while. To help us improve — what&apos;s keeping
                you away?
              </p>
              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
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
                rows={4}
                maxLength={4000}
              />
              <div className="flex justify-end">
                <Button onClick={submit} disabled={submitting || !token}>
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {submitting ? "Sending…" : "Send"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <FeedbackInner />
    </Suspense>
  );
}
