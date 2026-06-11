"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessageSquareWarning, Plus, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { useT, useLang } from "@/lib/i18n";

const categories = ["Personal", "District-All", "District-Specific", "Technical"];

interface Grievance {
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

export default function GrievancesPage() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [form, setForm] = useState({ subject: "", description: "", category: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const t = useT();
  const { lang } = useLang();

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        const u = d.user;
        setHasAccess(!!u && (u.role === "super_admin" || u.official_type === "state"));
      })
      .catch(() => setHasAccess(false));
  }, []);

  function load() {
    fetch(`/api/grievances?type=grievance&mine=1${lang === "ta" ? "&lang=ta" : ""}`)
      .then((r) => (r.ok ? r.json() : { grievances: [] }))
      .then((d) => setGrievances(d.grievances || []))
      .catch(() => toast.error("Failed to load grievances"))
      .finally(() => setLoaded(true));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [lang]);

  const stats = useMemo(() => {
    const pending = grievances.filter((g) => g.status === "pending").length;
    const inProgress = grievances.filter((g) => g.status === "in_progress").length;
    const resolved = grievances.filter((g) => g.status === "resolved").length;
    return { total: grievances.length, pending, inProgress, resolved };
  }, [grievances]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/grievances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const ticket = data?.grievance?.ticket_no;
      toast.success(ticket ? `${t("grievance.submitted_success")} — ${t("misc.ticket_no")}: ${ticket}` : t("grievance.submitted_success"));
      setForm({ subject: "", description: "", category: "" });
      setDialogOpen(false);
      load();
    } else {
      toast.error("Failed to submit grievance");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("grievance.title")}</h1>
          {grievances.length > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">{grievances.length} {t("grievance.title").toLowerCase()}</p>
          )}
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-1" />{t("common.submit")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("grievance.submit")}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><Label>{t("grievance.subject")} *</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder={t("grievance.brief_subject")} required /></div>
              <div><Label>{t("grievance.description")} *</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("grievance.describe_detail")} rows={4} required /></div>
              <div>
                <Label>{t("grievance.category")}</Label>
                <Select value={form.category} onValueChange={(val) => setForm({ ...form, category: val })}>
                  <SelectTrigger><SelectValue placeholder={t("grievance.select_category")} /></SelectTrigger>
                  <SelectContent>{categories.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">{loading ? t("grievance.submitting") : t("grievance.submit")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Notice: grievances are handled by state officials only */}
      {hasAccess === false && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <MessageSquareWarning className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">{t("grievance.restricted_title")}</p>
            <p className="text-xs text-amber-700 mt-0.5">{t("grievance.restricted_desc")}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label={t("misc.total")} value={stats.total} icon={MessageSquareWarning} loading={!loaded} borderColor="border-l-primary" iconColor="text-primary/40" />
        <MetricCard label={t("status.pending")} value={stats.pending} icon={Clock} loading={!loaded} borderColor="border-l-amber-500" iconColor="text-amber-500/40" />
        <MetricCard label={t("status.in_progress")} value={stats.inProgress} icon={AlertTriangle} loading={!loaded} borderColor="border-l-blue-500" iconColor="text-blue-500/40" />
        <MetricCard label={t("status.resolved")} value={stats.resolved} icon={CheckCircle2} loading={!loaded} borderColor="border-l-green-500" iconColor="text-green-500/40" />
      </div>

      {grievances.length === 0 && loaded ? (
        <EmptyState icon={MessageSquareWarning} title={t("grievance.no_grievances")} description={t("grievance.get_started")} />
      ) : (
        <div className="space-y-3">
          {grievances.map((g) => (
            <Card key={g.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageSquareWarning className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {g.ticket_no && <Badge variant="secondary" className="text-xs font-mono">{g.ticket_no}</Badge>}
                      <h3 className="font-medium text-sm">{g.subject}</h3>
                      <StatusBadge status={g.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{g.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {g.category && <Badge variant="outline" className="text-xs">{g.category}</Badge>}
                      <span className="text-xs text-muted-foreground">{formatDate(g.created_at)}</span>
                    </div>
                    {g.admin_remarks && (
                      <div className="mt-2 p-2.5 bg-muted/50 rounded-lg border-l-2 border-l-primary/30">
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
