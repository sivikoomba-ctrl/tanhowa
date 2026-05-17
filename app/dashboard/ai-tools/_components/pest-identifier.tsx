"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, Camera, X, ThumbsUp, ThumbsDown, HelpCircle, Sparkles, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

interface PestResult {
  id?: string | null;
  pest_name: string;
  tamil_name: string | null;
  crop: string;
  severity: string;
  confidence: string;
  treatment: string;
  prevention: string;
  additional_notes: string | null;
}

interface HistoryItem {
  id: string;
  created_at: string;
  image_url: string;
  predicted_pest_name: string;
  predicted_tamil_name: string;
  predicted_crop: string;
  predicted_severity: string;
  predicted_confidence: string;
  predicted_treatment: string;
  predicted_prevention: string;
  predicted_additional_notes: string;
  user_feedback: string | null;
  review_status: string;
  verified_pest_name: string;
  verified_tamil_name: string;
  verified_crop: string;
  verified_severity: string;
  verified_notes: string;
}

const severityColor: Record<string, string> = {
  mild: "bg-yellow-100 text-yellow-700",
  moderate: "bg-orange-100 text-orange-700",
  severe: "bg-red-100 text-red-700",
  none: "bg-green-100 text-green-700",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function PestIdentifier() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PestResult | null>(null);
  const [feedback, setFeedback] = useState<"helpful" | "incorrect" | "unsure" | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-tools/pest-identify");
      const data = await res.json();
      if (res.ok) setHistory(data.items || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  function handleFile(f: File) {
    if (f.size > 10 * 1024 * 1024) {
      toast.error(t("ai.image_too_large"));
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setFeedback(null);
  }

  function clearFile() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setFeedback(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleIdentify() {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai-tools/pest-identify", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to analyze");
        return;
      }
      setResult(data);
      loadHistory();
    } catch {
      toast.error("Failed to analyze image");
    } finally {
      setLoading(false);
    }
  }

  async function sendFeedback(value: "helpful" | "incorrect" | "unsure") {
    if (!result?.id) {
      toast.error("Feedback unavailable for this analysis");
      return;
    }
    setFeedback(value);
    try {
      const res = await fetch("/api/ai-tools/pest-identify/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: result.id, user_feedback: value }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        toast.error(d?.error || "Failed to save feedback");
        setFeedback(null);
        return;
      }
      toast.success("Thank you — feedback recorded");
      loadHistory();
    } catch {
      toast.error("Failed to save feedback");
      setFeedback(null);
    }
  }

  async function deleteHistoryItem(id: string) {
    if (!confirm("Delete this identification? This also removes it from the training dataset.")) return;
    try {
      const res = await fetch(`/api/ai-tools/pest-identify?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        toast.error(d?.error || "Failed to delete");
        return;
      }
      toast.success("Deleted");
      loadHistory();
    } catch {
      toast.error("Failed to delete");
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground flex gap-2">
        <Sparkles size={14} className="text-primary shrink-0 mt-0.5" />
        <span>Your photos and feedback help train TANHOWA&apos;s pest &amp; disease AI. Stored privately, reviewed by horticulture experts. You can delete any entry below.</span>
      </div>

      {!preview ? (
        <Card
          className="border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <CardContent className="p-8 flex flex-col items-center gap-3 text-muted-foreground">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <Camera size={24} />
            </div>
            <p className="text-sm font-medium">{t("ai.click_upload_plant")}</p>
            <p className="text-xs">{t("ai.jpg_png_10mb")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" className="rounded-xl max-h-64 w-full object-contain bg-muted" />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7"
            onClick={clearFile}
          >
            <X size={14} />
          </Button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {file && !result && (
        <Button onClick={handleIdentify} disabled={loading} className="w-full">
          {loading ? <><Loader2 size={16} className="animate-spin mr-2" /> {t("ai.analyzing")}</> : <><Upload size={16} className="mr-2" /> {t("ai.identify_pest")}</>}
        </Button>
      )}

      {result && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-lg">{result.pest_name}</h3>
                {result.tamil_name && <p className="text-sm text-muted-foreground">{result.tamil_name}</p>}
              </div>
              <div className="flex gap-2">
                <Badge className={severityColor[result.severity] || "bg-muted"}>{result.severity}</Badge>
                <Badge variant="outline">{result.confidence} {t("ai.confidence")}</Badge>
              </div>
            </div>

            <div className="text-sm space-y-3">
              <div>
                <p className="font-medium text-muted-foreground mb-1">{t("ai.crop_label")}</p>
                <p>{result.crop}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground mb-1">{t("ai.treatment")}</p>
                <p className="whitespace-pre-wrap">{result.treatment}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground mb-1">{t("ai.prevention")}</p>
                <p className="whitespace-pre-wrap">{result.prevention}</p>
              </div>
              {result.additional_notes && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">{t("ai.additional_notes")}</p>
                  <p className="whitespace-pre-wrap">{result.additional_notes}</p>
                </div>
              )}
            </div>

            {result.id && (
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Was this identification helpful?</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={feedback === "helpful" ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => sendFeedback("helpful")}
                    disabled={feedback !== null && feedback !== "helpful"}
                  >
                    <ThumbsUp size={12} className="mr-1" /> Helpful
                  </Button>
                  <Button
                    size="sm"
                    variant={feedback === "incorrect" ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => sendFeedback("incorrect")}
                    disabled={feedback !== null && feedback !== "incorrect"}
                  >
                    <ThumbsDown size={12} className="mr-1" /> Incorrect
                  </Button>
                  <Button
                    size="sm"
                    variant={feedback === "unsure" ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => sendFeedback("unsure")}
                    disabled={feedback !== null && feedback !== "unsure"}
                  >
                    <HelpCircle size={12} className="mr-1" /> Not sure
                  </Button>
                </div>
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={clearFile}>
              {t("ai.try_another")}
            </Button>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="w-full flex items-center justify-between text-sm font-medium"
            >
              <span>My Past Identifications ({history.length})</span>
              {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {historyOpen && (
              <div className="mt-3 space-y-2">
                {history.map((h) => {
                  const expanded = expandedHistoryId === h.id;
                  const isVerified = h.review_status === "confirmed" || h.review_status === "corrected";
                  const displayName = isVerified ? (h.verified_pest_name || h.predicted_pest_name) : h.predicted_pest_name;
                  return (
                    <div key={h.id} className="border rounded-lg p-2">
                      <div className="flex items-center gap-3">
                        {h.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={h.image_url} alt="" className="w-12 h-12 rounded object-cover bg-muted shrink-0" />
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedHistoryId(expanded ? null : h.id)}
                          className="flex-1 text-left min-w-0"
                        >
                          <p className="text-sm font-medium truncate">{displayName || "Untitled"}</p>
                          <p className="text-xs text-muted-foreground">{timeAgo(h.created_at)} · {h.predicted_crop || "—"}</p>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          {isVerified && <Badge variant="outline" className="text-[10px] h-5 bg-green-50 text-green-700 border-green-200">Verified</Badge>}
                          {h.user_feedback === "helpful" && <ThumbsUp size={12} className="text-green-600" />}
                          {h.user_feedback === "incorrect" && <ThumbsDown size={12} className="text-red-600" />}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteHistoryItem(h.id)}>
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="mt-3 pl-15 text-xs space-y-2 text-muted-foreground border-t pt-3">
                          {h.predicted_tamil_name && <p>{h.predicted_tamil_name}</p>}
                          <div><span className="font-medium text-foreground">Severity:</span> {h.predicted_severity || "—"} · <span className="font-medium text-foreground">Confidence:</span> {h.predicted_confidence || "—"}</div>
                          {h.predicted_treatment && <div><span className="font-medium text-foreground">Treatment:</span> <span className="whitespace-pre-wrap">{h.predicted_treatment}</span></div>}
                          {h.predicted_prevention && <div><span className="font-medium text-foreground">Prevention:</span> <span className="whitespace-pre-wrap">{h.predicted_prevention}</span></div>}
                          {isVerified && h.verified_notes && (
                            <div className="mt-2 p-2 rounded bg-green-50 border border-green-200 text-green-900">
                              <span className="font-medium">Expert notes:</span> {h.verified_notes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
