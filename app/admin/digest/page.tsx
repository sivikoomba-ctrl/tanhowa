"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { Lock, Loader2, Send, Mail, Users, Megaphone, Calendar, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface DigestStatus {
  held: boolean;
  recipientCount: number;
  isEmpty: boolean;
  content: {
    announcements: { title: string; snippet: string }[];
    events: { title: string; date: string; location: string | null }[];
    generatedAt: string;
  };
}

export default function DigestPage() {
  const [status, setStatus] = useState<DigestStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/weekly-digest");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      setStatus(await res.json());
    } catch {
      toast.error("Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function sendPreview() {
    setSending(true);
    try {
      const res = await fetch("/api/admin/weekly-digest", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.sent > 0) toast.success("Preview sent to your email");
      else toast.error(data.error || "Preview failed");
    } catch {
      toast.error("Preview failed");
    } finally {
      setSending(false);
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
            <p className="text-sm text-muted-foreground">The weekly digest control is reserved for the State-Admin only.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="w-6 h-6 text-primary" />
          Weekly Digest
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          One weekly email with the latest announcements &amp; upcoming events, sent every Monday to
          opted-in members. Bounced addresses and opt-outs are skipped automatically.
        </p>
      </div>

      {/* Master switch status */}
      {status.held ? (
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Member emails are currently on hold.</p>
              <p className="text-muted-foreground mt-1">
                The weekly cron will not send to members yet. You can still send yourself a preview below.
                When you&apos;re happy, set <code className="text-xs bg-muted px-1 rounded">HOLD_MEMBER_EMAILS = false</code> in
                <code className="text-xs bg-muted px-1 rounded">lib/mail.ts</code> to go live.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4 flex items-center gap-3">
            <Send className="w-5 h-5 text-green-600 shrink-0" />
            <p className="text-sm font-medium">Live — the weekly cron will send to opted-in members every Monday.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard label="Recipients (opted in)" value={String(status.recipientCount)} icon={Users} borderColor="border-l-primary" />
        <MetricCard label="Announcements" value={String(status.content.announcements.length)} icon={Megaphone} borderColor="border-l-blue-500" />
        <MetricCard label="Upcoming events" value={String(status.content.events.length)} icon={Calendar} borderColor="border-l-green-500" />
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={sendPreview} disabled={sending || status.isEmpty}>
          {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Send preview to me
        </Button>
        {status.isEmpty && <span className="text-sm text-muted-foreground">No content this week — nothing to send.</span>}
      </div>

      {/* Preview of content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">This week&apos;s content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium flex items-center gap-2 mb-2"><Megaphone className="w-4 h-4 text-blue-500" /> Announcements</p>
            {status.content.announcements.length === 0 ? (
              <p className="text-sm text-muted-foreground">None in the last 7 days.</p>
            ) : (
              <ul className="space-y-2">
                {status.content.announcements.map((a, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{a.title}</span>
                    {a.snippet && <span className="text-muted-foreground"> — {a.snippet}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-sm font-medium flex items-center gap-2 mb-2"><Calendar className="w-4 h-4 text-green-500" /> Upcoming events</p>
            {status.content.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">None in the next 14 days.</p>
            ) : (
              <ul className="space-y-1.5">
                {status.content.events.map((e, i) => (
                  <li key={i} className="text-sm">
                    <Badge variant="outline" className="text-[10px] mr-2">{e.date}</Badge>
                    {e.title}
                    {e.location && <span className="text-muted-foreground"> · {e.location}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
