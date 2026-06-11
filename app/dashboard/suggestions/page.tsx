"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Lightbulb, Plus, CheckCircle2, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { useT, useLang } from "@/lib/i18n";

interface Suggestion {
  id: string;
  ticket_no: string | null;
  subject: string;
  description: string;
  category: string;
  status: string;
  admin_remarks: string;
  created_at: string;
  updated_at: string;
}

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [form, setForm] = useState({ subject: "", description: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const t = useT();
  const { lang } = useLang();

  function load() {
    fetch(`/api/grievances?type=suggestion${lang === "ta" ? "&lang=ta" : ""}`)
      .then((r) => r.json())
      .then((d) => setSuggestions(d.grievances || []))
      .catch(() => toast.error("Failed to load suggestions"))
      .finally(() => setLoaded(true));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [lang]);

  const stats = useMemo(() => {
    const pending = suggestions.filter((s) => s.status === "pending").length;
    const resolved = suggestions.filter((s) => s.status === "resolved").length;
    return { total: suggestions.length, pending, resolved };
  }, [suggestions]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/grievances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, category: "Suggestion" }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const ticket = data?.grievance?.ticket_no;
      toast.success(ticket ? `Suggestion submitted — ${t("misc.ticket_no")}: ${ticket}` : "Suggestion submitted");
      setForm({ subject: "", description: "" });
      setDialogOpen(false);
      load();
    } else {
      toast.error("Failed to submit suggestion");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("suggestion.title")}</h1>
          {suggestions.length > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">{suggestions.length} {t("suggestion.title").toLowerCase()}</p>
          )}
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-1" />{t("common.submit")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("suggestion.submit")}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><Label>{t("grievance.subject")} *</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder={t("grievance.brief_subject")} required /></div>
              <div><Label>{t("grievance.description")} *</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("grievance.describe_detail")} rows={4} required /></div>
              <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">{loading ? t("suggestion.submitting") : t("suggestion.submit")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label={t("misc.total")} value={stats.total} icon={Lightbulb} loading={!loaded} borderColor="border-l-yellow-500" iconColor="text-yellow-500/40" />
        <MetricCard label={t("status.pending")} value={stats.pending} icon={Clock} loading={!loaded} borderColor="border-l-amber-500" iconColor="text-amber-500/40" />
        <MetricCard label={t("status.resolved")} value={stats.resolved} icon={CheckCircle2} loading={!loaded} borderColor="border-l-green-500" iconColor="text-green-500/40" />
      </div>

      {suggestions.length === 0 && loaded ? (
        <EmptyState icon={Lightbulb} title={t("suggestion.no_suggestions")} description={t("suggestion.share_ideas")} />
      ) : (
        <div className="space-y-3">
          {suggestions.map((g) => (
            <Card key={g.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center shrink-0">
                    <Lightbulb className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {g.ticket_no && <Badge variant="secondary" className="text-xs font-mono">{g.ticket_no}</Badge>}
                      <h3 className="font-medium text-sm">{g.subject}</h3>
                      <StatusBadge status={g.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{g.description}</p>
                    <span className="text-xs text-muted-foreground mt-1.5 block">{formatDate(g.created_at)}</span>
                    {g.admin_remarks && (
                      <div className="mt-2 p-2.5 bg-muted/50 rounded-lg border-l-2 border-l-yellow-400/50">
                        <p className="text-xs font-medium text-muted-foreground">{t("grievance.admin_remarks")}</p>
                        <p className="text-xs mt-0.5">{g.admin_remarks}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
