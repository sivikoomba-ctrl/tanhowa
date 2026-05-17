"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, X, AlertTriangle, Trash2, Download, FileJson, FileText } from "lucide-react";
import { toast } from "sonner";

interface QueueRow {
  id: string;
  created_at: string;
  image_url: string;
  member_district: string;
  gemini_model_version: string;
  predicted_pest_name: string;
  predicted_tamil_name: string;
  predicted_crop: string;
  predicted_severity: string;
  predicted_confidence: string;
  predicted_treatment: string;
  predicted_prevention: string;
  predicted_additional_notes: string;
  user_feedback: string | null;
  user_feedback_note: string;
  verified_pest_name: string;
  verified_tamil_name: string;
  verified_crop: string;
  verified_severity: string;
  verified_notes: string;
  verified_at: string | null;
  review_status: string;
  user: { name: string; email: string } | null;
}

const STATUSES = ["pending", "confirmed", "corrected", "rejected", "unusable"] as const;
type Status = typeof STATUSES[number];

const SEVERITY_OPTIONS = ["mild", "moderate", "severe", "none"];

export default function AdminPestTrainingPage() {
  const [status, setStatus] = useState<Status>("pending");
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ pest: "", tamil: "", crop: "", severity: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/pest-training?status=${status}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to load queue");
        return;
      }
      setRows(data.items || []);
      setCounts(data.counts || {});
    } catch {
      toast.error("Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  function pick(row: QueueRow) {
    setSelectedId(row.id);
    setDraft({
      pest: row.verified_pest_name || row.predicted_pest_name || "",
      tamil: row.verified_tamil_name || row.predicted_tamil_name || "",
      crop: row.verified_crop || row.predicted_crop || "",
      severity: row.verified_severity || row.predicted_severity || "",
      notes: row.verified_notes || "",
    });
  }

  async function act(action: "confirm" | "correct" | "reject" | "unusable") {
    if (!selectedId) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { id: selectedId, action };
      if (action === "correct") {
        if (!draft.pest.trim() || !draft.tamil.trim()) {
          toast.error("Both English and Tamil pest names are required");
          setSaving(false);
          return;
        }
        body.verified_pest_name = draft.pest;
        body.verified_tamil_name = draft.tamil;
        body.verified_crop = draft.crop;
        body.verified_severity = draft.severity;
        body.verified_notes = draft.notes;
      } else {
        body.verified_notes = draft.notes;
      }
      const res = await fetch("/api/admin/pest-training", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save");
        return;
      }
      toast.success("Saved");
      setSelectedId(null);
      load();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function exportData(format: "jsonl" | "csv") {
    window.open(`/api/admin/pest-training/export?format=${format}`, "_blank");
  }

  const selected = rows.find((r) => r.id === selectedId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pest AI Training Queue</h1>
          <p className="text-sm text-muted-foreground">Verify member-submitted plant photos to build the labeled dataset.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportData("jsonl")} disabled={(counts.confirmed || 0) + (counts.corrected || 0) === 0}>
            <FileJson size={14} className="mr-1.5" /> Export JSONL
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportData("csv")} disabled={(counts.confirmed || 0) + (counts.corrected || 0) === 0}>
            <FileText size={14} className="mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {STATUSES.map((s) => (
          <Card key={s} className={`cursor-pointer transition ${status === s ? "border-primary" : ""}`} onClick={() => { setStatus(s); setSelectedId(null); }}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{counts[s] ?? 0}</p>
              <p className="text-xs text-muted-foreground capitalize">{s}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={status} onValueChange={(v) => { setStatus(v as Status); setSelectedId(null); }}>
        <TabsList>
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s} className="capitalize">{s}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">No {status} entries.</p>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
            {rows.map((r) => (
              <Card key={r.id} className={`cursor-pointer transition ${selectedId === r.id ? "border-primary ring-2 ring-primary/20" : ""}`} onClick={() => pick(r)}>
                <CardContent className="p-3 flex gap-3">
                  {r.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image_url} alt="" className="w-16 h-16 rounded object-cover bg-muted shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.predicted_pest_name || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.user?.name || "Unknown"} · {r.member_district || "—"}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {r.predicted_crop && <Badge variant="outline" className="text-[10px] h-5">{r.predicted_crop}</Badge>}
                      {r.predicted_severity && <Badge variant="outline" className="text-[10px] h-5">{r.predicted_severity}</Badge>}
                      {r.user_feedback === "incorrect" && <Badge className="text-[10px] h-5 bg-red-100 text-red-700">flagged</Badge>}
                      {r.user_feedback === "helpful" && <Badge className="text-[10px] h-5 bg-green-100 text-green-700">helpful</Badge>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div>
            {selected ? (
              <Card className="sticky top-4">
                <CardContent className="p-5 space-y-4">
                  {selected.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.image_url} alt="" className="rounded-xl max-h-72 w-full object-contain bg-muted" />
                  )}

                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><span className="font-medium text-foreground">Submitted by:</span> {selected.user?.name || "—"} ({selected.user?.email || "—"})</p>
                    <p><span className="font-medium text-foreground">District:</span> {selected.member_district || "—"}</p>
                    <p><span className="font-medium text-foreground">Model:</span> {selected.gemini_model_version}</p>
                    {selected.user_feedback && (
                      <p><span className="font-medium text-foreground">Member feedback:</span> {selected.user_feedback}{selected.user_feedback_note ? ` — "${selected.user_feedback_note}"` : ""}</p>
                    )}
                  </div>

                  <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
                    <p className="font-medium mb-1">Gemini prediction:</p>
                    <p><span className="text-muted-foreground">Pest:</span> {selected.predicted_pest_name || "—"}{selected.predicted_tamil_name ? ` (${selected.predicted_tamil_name})` : ""}</p>
                    <p><span className="text-muted-foreground">Crop:</span> {selected.predicted_crop || "—"} · <span className="text-muted-foreground">Severity:</span> {selected.predicted_severity || "—"} · <span className="text-muted-foreground">Confidence:</span> {selected.predicted_confidence || "—"}</p>
                    {selected.predicted_treatment && <p className="line-clamp-3"><span className="text-muted-foreground">Treatment:</span> {selected.predicted_treatment}</p>}
                  </div>

                  <div className="space-y-3 border-t pt-3">
                    <p className="text-sm font-medium">Ground truth (both English &amp; Tamil names required to save a correction):</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Pest name (EN) *</Label>
                        <Input value={draft.pest} onChange={(e) => setDraft({ ...draft, pest: e.target.value })} className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">Pest name (TA) *</Label>
                        <Input value={draft.tamil} onChange={(e) => setDraft({ ...draft, tamil: e.target.value })} className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">Crop</Label>
                        <Input value={draft.crop} onChange={(e) => setDraft({ ...draft, crop: e.target.value })} className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">Severity</Label>
                        <Select value={draft.severity} onValueChange={(v) => setDraft({ ...draft, severity: v })}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {SEVERITY_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Expert notes</Label>
                      <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} className="mt-1" />
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap pt-2">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => act("confirm")} disabled={saving}>
                      <Check size={14} className="mr-1" /> Confirm (Gemini was right)
                    </Button>
                    <Button size="sm" variant="default" onClick={() => act("correct")} disabled={saving}>
                      <Check size={14} className="mr-1" /> Save Correction
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act("reject")} disabled={saving}>
                      <X size={14} className="mr-1" /> Reject
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act("unusable")} disabled={saving} title="Too blurry / unrelated — drops from training set">
                      <AlertTriangle size={14} className="mr-1" /> Unusable
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)} disabled={saving}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  {saving && <p className="text-xs text-muted-foreground"><Loader2 size={12} className="inline animate-spin mr-1" /> Saving…</p>}
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Download size={10} /> Confirmed &amp; corrected rows are included in JSONL/CSV exports.</p>
                </CardContent>
              </Card>
            ) : (
              <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">Select an entry to review.</CardContent></Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
