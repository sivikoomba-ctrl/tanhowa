"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import {
  Lock,
  Loader2,
  RefreshCw,
  Sparkles,
  MessageCircle,
  ThumbsUp,
  ThumbsDown,
  Wrench,
  Star,
} from "lucide-react";
import { toast } from "sonner";

interface PulseSummary {
  generated_at: string;
  window_days: number;
  totals: {
    feedback_rows: number;
    grievances: number;
    suggestions: number;
    ideas: number;
    average_rating: number | null;
    rating_count: number;
  };
  source_breakdown: Record<string, number>;
  top_reasons: { reason: string; count: number }[];
  themes: string[];
  highlights: { kind: "praise" | "complaint" | "request"; text: string }[];
  recommended_actions: string[];
}

interface FeedbackRow {
  id: string;
  source: string;
  rating: number | null;
  reason: string | null;
  comment: string | null;
  page_url: string | null;
  created_at: string;
  users?: { name: string; email: string } | null;
}

const SOURCE_LABEL: Record<string, string> = {
  widget: "In-app widget",
  re_engagement: "Re-engagement modal",
  inactive_email: "Inactive email link",
};

const REASON_LABEL: Record<string, string> = {
  busy_work: "Busy with field work",
  not_useful: "Didn't find it useful enough",
  tech_issues: "Technical issues",
  didnt_know: "Didn't know what to do",
  other: "Other",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FeedbackPulsePage() {
  const [summary, setSummary] = useState<PulseSummary | null>(null);
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [cached, setCached] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [summaryRes, rowsRes] = await Promise.all([
        fetch("/api/admin/feedback-pulse"),
        fetch("/api/admin/feedback-pulse", { method: "PUT" }),
      ]);
      if (summaryRes.status === 403) {
        setForbidden(true);
        return;
      }
      const summaryData = await summaryRes.json();
      setSummary(summaryData.summary);
      setCached(!!summaryData.cached);
      const rowsData = await rowsRes.json();
      setRows(rowsData.feedback || []);
    } catch {
      toast.error("Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      await fetch("/api/admin/feedback-pulse", { method: "POST" });
      await load();
      toast.success("Pulse refreshed");
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Restricted</h2>
            <p className="text-sm text-muted-foreground">
              Feedback Pulse is reserved for the State-Admin only.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Feedback Pulse
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-summarised member feedback from the last {summary.window_days} days. Combines the
            in-app widget, re-engagement modal, inactive-email submissions, grievances, suggestions,
            and wishlist ideas.
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Generated {formatDateTime(summary.generated_at)}{cached ? " (cached, refresh for latest)" : ""}.
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Re-run AI summary
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Feedback rows"
          value={String(summary.totals.feedback_rows)}
          icon={MessageCircle}
          borderColor="border-l-primary"
        />
        <MetricCard
          label="Avg rating"
          value={
            summary.totals.average_rating != null
              ? `${summary.totals.average_rating}/5`
              : "—"
          }
          icon={Star}
          borderColor="border-l-amber-500"
        />
        <MetricCard
          label="Grievances"
          value={String(summary.totals.grievances)}
          icon={ThumbsDown}
          borderColor="border-l-red-500"
        />
        <MetricCard
          label="Ideas"
          value={String(summary.totals.ideas)}
          icon={ThumbsUp}
          borderColor="border-l-green-500"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(summary.source_breakdown).length === 0 ? (
              <p className="text-sm text-muted-foreground">No widget/modal/email submissions yet.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(summary.source_breakdown).map(([src, count]) => (
                  <div key={src} className="flex items-center justify-between text-sm">
                    <span>{SOURCE_LABEL[src] || src}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top reasons (re-engagement / inactive)</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.top_reasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reason data yet.</p>
            ) : (
              <div className="space-y-2">
                {summary.top_reasons.map((r) => (
                  <div key={r.reason} className="flex items-center justify-between text-sm">
                    <span>{REASON_LABEL[r.reason] || r.reason}</span>
                    <Badge variant="secondary">{r.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Themes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary.themes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Not enough signal for AI themes yet — keep collecting.
            </p>
          ) : (
            <ul className="space-y-2 list-disc list-inside text-sm">
              {summary.themes.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Highlights</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.highlights.length === 0 ? (
            <p className="text-sm text-muted-foreground">No standout quotes yet.</p>
          ) : (
            <div className="space-y-3">
              {summary.highlights.map((h, i) => {
                const tone =
                  h.kind === "praise"
                    ? "border-green-500/40 bg-green-500/5"
                    : h.kind === "complaint"
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-blue-500/40 bg-blue-500/5";
                return (
                  <div key={i} className={`border-l-4 pl-3 py-1.5 rounded-r-md ${tone}`}>
                    <Badge variant="outline" className="text-[10px] mb-1">{h.kind}</Badge>
                    <p className="text-sm">{h.text}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary" />
            Recommended actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary.recommended_actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recommendations yet.</p>
          ) : (
            <ul className="space-y-2 list-decimal list-inside text-sm">
              {summary.recommended_actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent feedback (raw)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No feedback in the last 30 days.</p>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <div key={r.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {SOURCE_LABEL[r.source] || r.source}
                      </Badge>
                      {r.rating != null && (
                        <span className="text-amber-500 inline-flex items-center gap-0.5">
                          {Array.from({ length: r.rating }).map((_, i) => (
                            <Star key={i} className="w-3.5 h-3.5 fill-current" />
                          ))}
                        </span>
                      )}
                      {r.reason && (
                        <Badge variant="secondary" className="text-[10px]">
                          {REASON_LABEL[r.reason] || r.reason}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDateTime(r.created_at)}
                    </span>
                  </div>
                  {r.comment && <p className="whitespace-pre-wrap">{r.comment}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {r.users?.name || "Anonymous"}
                    {r.page_url ? ` · ${r.page_url}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
