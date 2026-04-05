"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { TicketCheck, Plus, CheckCircle2, Clock, Loader2, AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { useT, useLang } from "@/lib/i18n";

const SERVICE_CATEGORIES = [
  "Transfer",
  "Training",
  "Legal Help",
  "Certificate",
  "Letter/Recommendation",
  "Welfare",
  "IT Support",
  "Other Service",
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

interface ServiceRequest {
  id: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  admin_remarks: string;
  created_at: string;
  updated_at: string;
}

export default function ServiceRequestsPage() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [form, setForm] = useState({ subject: "", description: "", category: "Transfer", priority: "medium" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const t = useT();
  const { lang } = useLang();

  function load() {
    fetch(`/api/grievances?type=service-request${lang === "ta" ? "&lang=ta" : ""}`)
      .then((r) => r.json())
      .then((d) => setRequests(d.grievances || []))
      .catch(() => toast.error(t("sr.load_failed")))
      .finally(() => setLoaded(true));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [lang]);

  const stats = useMemo(() => {
    const pending = requests.filter((s) => s.status === "pending").length;
    const inProgress = requests.filter((s) => s.status === "in_progress").length;
    const resolved = requests.filter((s) => s.status === "resolved").length;
    return { total: requests.length, pending, inProgress, resolved };
  }, [requests]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject.trim()) { toast.error(t("sr.subject_required")); return; }
    setLoading(true);
    const res = await fetch("/api/grievances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, priority: form.priority }),
    });
    if (res.ok) {
      toast.success(t("sr.submitted"));
      setForm({ subject: "", description: "", category: "Transfer", priority: "medium" });
      setDialogOpen(false);
      load();
    } else {
      toast.error(t("sr.submit_failed"));
    }
    setLoading(false);
  }

  function getStatusIcon(status: string) {
    if (status === "resolved") return <CheckCircle2 size={14} className="text-green-600" />;
    if (status === "in_progress") return <Loader2 size={14} className="text-blue-600" />;
    if (status === "rejected") return <AlertTriangle size={14} className="text-red-600" />;
    return <Clock size={14} className="text-amber-600" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("sr.title")}</h1>
          {requests.length > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">{requests.length} {t("sr.requests")}</p>
          )}
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-1" />{t("sr.new_request")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("sr.submit_request")}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>{t("sr.category")} *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{t(`sr.cat_${c.toLowerCase().replace(/[\s\/]/g, "_")}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("grievance.subject")} *</Label>
                <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder={t("sr.subject_ph")} required className="mt-1" />
              </div>
              <div>
                <Label>{t("grievance.description")} *</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("sr.desc_ph")} rows={4} required className="mt-1" />
              </div>
              <div>
                <Label>{t("sr.priority")}</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{t(`sr.pri_${p.value}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
                {loading ? t("sr.submitting") : t("sr.submit_request")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label={t("misc.total")} value={stats.total} icon={TicketCheck} loading={!loaded} borderColor="border-l-blue-500" iconColor="text-blue-500/40" />
        <MetricCard label={t("status.pending")} value={stats.pending} icon={Clock} loading={!loaded} borderColor="border-l-amber-500" iconColor="text-amber-500/40" />
        <MetricCard label={t("status.in_progress")} value={stats.inProgress} icon={Loader2} loading={!loaded} borderColor="border-l-blue-500" iconColor="text-blue-500/40" />
        <MetricCard label={t("status.resolved")} value={stats.resolved} icon={CheckCircle2} loading={!loaded} borderColor="border-l-green-500" iconColor="text-green-500/40" />
      </div>

      {requests.length === 0 && loaded ? (
        <EmptyState icon={TicketCheck} title={t("sr.no_requests")} description={t("sr.no_requests_desc")} />
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    {getStatusIcon(r.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-sm">{r.subject}</h3>
                      <StatusBadge status={r.status} />
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r.category}</span>
                      {r.priority === "high" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">High Priority</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                    <span className="text-xs text-muted-foreground mt-1.5 block">{formatDate(r.created_at)}</span>
                    {r.admin_remarks && (
                      <div className="mt-2 p-2.5 bg-muted/50 rounded-lg border-l-2 border-l-blue-400/50">
                        <p className="text-xs font-medium text-muted-foreground">{t("grievance.admin_remarks")}</p>
                        <p className="text-xs mt-0.5">{r.admin_remarks}</p>
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
