"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Upload, Loader2, Camera, X, ThumbsUp, ThumbsDown, HelpCircle, Sparkles, Trash2, ChevronDown, ChevronUp, Plus, ZoomIn, ZoomOut, AlertTriangle, RotateCw } from "lucide-react";
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

type ItemStatus = "idle" | "loading" | "done" | "error";

interface PestItem {
  uid: string;
  file: File;
  preview: string;
  status: ItemStatus;
  result: PestResult | null;
  error: string | null;
  feedback: "helpful" | "incorrect" | "unsure" | null;
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

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

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

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function PestIdentifier() {
  const [items, setItems] = useState<PestItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  // Zoom lightbox state
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-tools/pest-identify");
      const data = await res.json();
      if (res.ok) setHistory(data.items || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => { items.forEach((it) => URL.revokeObjectURL(it.preview)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const next: PestItem[] = [];
    for (const f of Array.from(fileList)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name}: ${t("ai.image_too_large")}`);
        continue;
      }
      next.push({ uid: uid(), file: f, preview: URL.createObjectURL(f), status: "idle", result: null, error: null, feedback: null });
    }
    if (next.length) setItems((prev) => [...prev, ...next]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const found = prev.find((it) => it.uid === id);
      if (found) URL.revokeObjectURL(found.preview);
      return prev.filter((it) => it.uid !== id);
    });
  }

  function clearAll() {
    items.forEach((it) => URL.revokeObjectURL(it.preview));
    setItems([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  const patch = useCallback((id: string, updates: Partial<PestItem>) => {
    setItems((prev) => prev.map((it) => (it.uid === id ? { ...it, ...updates } : it)));
  }, []);

  const analyzeOne = useCallback(async (item: PestItem) => {
    patch(item.uid, { status: "loading", error: null });
    try {
      const formData = new FormData();
      formData.append("file", item.file);
      const res = await fetch("/api/ai-tools/pest-identify", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        patch(item.uid, { status: "error", error: data.error || t("ai.analysis_failed") });
        return false;
      }
      patch(item.uid, { status: "done", result: data, feedback: null });
      return true;
    } catch {
      patch(item.uid, { status: "error", error: t("ai.analysis_failed") });
      return false;
    }
  }, [patch, t]);

  async function analyzeAll() {
    const pending = items.filter((it) => it.status === "idle" || it.status === "error");
    if (!pending.length) return;
    setAnalyzing(true);
    let anyOk = false;
    for (const it of pending) {
      // read latest file from ref-free closure — `it` holds the File which is stable
      const ok = await analyzeOne(it);
      anyOk = anyOk || ok;
    }
    setAnalyzing(false);
    if (anyOk) loadHistory();
  }

  async function sendFeedback(item: PestItem, value: "helpful" | "incorrect" | "unsure") {
    if (!item.result?.id) {
      toast.error("Feedback unavailable for this analysis");
      return;
    }
    patch(item.uid, { feedback: value });
    try {
      const res = await fetch("/api/ai-tools/pest-identify/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.result.id, user_feedback: value }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        toast.error(d?.error || "Failed to save feedback");
        patch(item.uid, { feedback: null });
        return;
      }
      toast.success("Thank you — feedback recorded");
      loadHistory();
    } catch {
      toast.error("Failed to save feedback");
      patch(item.uid, { feedback: null });
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

  // ── Zoom lightbox handlers ──
  const openZoom = (src: string) => {
    setZoomSrc(src);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const zoomBy = useCallback((delta: number) => {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);
  const onWheel = (e: React.WheelEvent) => zoomBy(e.deltaY < 0 ? 0.3 : -0.3);
  const onDoubleClick = () =>
    setZoom((z) => {
      const next = z > 1 ? 1 : 2;
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    setPan({ x: drag.current.baseX + (e.clientX - drag.current.startX), y: drag.current.baseY + (e.clientY - drag.current.startY) });
  };
  const onPointerUp = () => { drag.current.active = false; };

  const pendingCount = items.filter((it) => it.status === "idle" || it.status === "error").length;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground flex gap-2">
        <Sparkles size={14} className="text-primary shrink-0 mt-0.5" />
        <span>Your photos and feedback help train TANHOWA&apos;s pest &amp; disease AI. Stored privately, reviewed by horticulture experts. You can delete any entry below.</span>
      </div>

      {items.length === 0 ? (
        <Card
          className="border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <CardContent className="p-8 flex flex-col items-center gap-3 text-muted-foreground">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <Camera size={24} />
            </div>
            <p className="text-sm font-medium">{t("ai.click_upload_plants")}</p>
            <p className="text-xs">{t("ai.jpg_png_10mb_multi")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.uid} className="overflow-hidden">
              <CardContent className="p-3 space-y-3">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.preview}
                    alt="Preview"
                    className="rounded-xl max-h-64 w-full object-contain bg-muted cursor-zoom-in"
                    onClick={() => openZoom(item.preview)}
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7"
                    onClick={() => removeItem(item.uid)}
                  >
                    <X size={14} />
                  </Button>
                  <div className="absolute bottom-2 right-2 rounded-md bg-black/50 text-white p-1 pointer-events-none">
                    <ZoomIn size={14} />
                  </div>
                </div>

                {item.status === "loading" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 size={16} className="animate-spin" /> {t("ai.analyzing")}
                  </div>
                )}

                {item.status === "error" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-red-600">
                      <AlertTriangle size={16} /> {item.error || t("ai.analysis_failed")}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => analyzeOne(item)} disabled={analyzing}>
                      <RotateCw size={14} className="mr-1" /> {t("ai.retry")}
                    </Button>
                  </div>
                )}

                {item.status === "idle" && (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => analyzeOne(item)} disabled={analyzing}>
                    <Upload size={14} className="mr-2" /> {t("ai.analyze")}
                  </Button>
                )}

                {item.status === "done" && item.result && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="font-bold text-lg">{item.result.pest_name}</h3>
                        {item.result.tamil_name && <p className="text-sm text-muted-foreground">{item.result.tamil_name}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Badge className={severityColor[item.result.severity] || "bg-muted"}>{item.result.severity}</Badge>
                        <Badge variant="outline">{item.result.confidence} {t("ai.confidence")}</Badge>
                      </div>
                    </div>

                    <div className="text-sm space-y-3">
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">{t("ai.crop_label")}</p>
                        <p>{item.result.crop}</p>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">{t("ai.treatment")}</p>
                        <p className="whitespace-pre-wrap">{item.result.treatment}</p>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">{t("ai.prevention")}</p>
                        <p className="whitespace-pre-wrap">{item.result.prevention}</p>
                      </div>
                      {item.result.additional_notes && (
                        <div>
                          <p className="font-medium text-muted-foreground mb-1">{t("ai.additional_notes")}</p>
                          <p className="whitespace-pre-wrap">{item.result.additional_notes}</p>
                        </div>
                      )}
                    </div>

                    {item.result.id && (
                      <div className="border-t pt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Was this identification helpful?</p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={item.feedback === "helpful" ? "default" : "outline"}
                            className="h-8 text-xs"
                            onClick={() => sendFeedback(item, "helpful")}
                            disabled={item.feedback !== null && item.feedback !== "helpful"}
                          >
                            <ThumbsUp size={12} className="mr-1" /> Helpful
                          </Button>
                          <Button
                            size="sm"
                            variant={item.feedback === "incorrect" ? "default" : "outline"}
                            className="h-8 text-xs"
                            onClick={() => sendFeedback(item, "incorrect")}
                            disabled={item.feedback !== null && item.feedback !== "incorrect"}
                          >
                            <ThumbsDown size={12} className="mr-1" /> Incorrect
                          </Button>
                          <Button
                            size="sm"
                            variant={item.feedback === "unsure" ? "default" : "outline"}
                            className="h-8 text-xs"
                            onClick={() => sendFeedback(item, "unsure")}
                            disabled={item.feedback !== null && item.feedback !== "unsure"}
                          >
                            <HelpCircle size={12} className="mr-1" /> Not sure
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Batch actions */}
          <div className="flex flex-wrap gap-2">
            {pendingCount > 0 && (
              <Button onClick={analyzeAll} disabled={analyzing} className="flex-1 min-w-[140px]">
                {analyzing ? <><Loader2 size={16} className="animate-spin mr-2" /> {t("ai.analyzing")}</> : <><Upload size={16} className="mr-2" /> {t("ai.analyze_all", { count: String(pendingCount) })}</>}
              </Button>
            )}
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={analyzing}>
              <Plus size={16} className="mr-2" /> {t("ai.add_more")}
            </Button>
            <Button variant="outline" onClick={clearAll} disabled={analyzing}>
              <Trash2 size={16} className="mr-2" /> {t("ai.clear_all")}
            </Button>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

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
                          <img
                            src={h.image_url}
                            alt=""
                            className="w-12 h-12 rounded object-cover bg-muted shrink-0 cursor-zoom-in"
                            onClick={() => openZoom(h.image_url)}
                          />
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

      {/* Zoom lightbox */}
      <Dialog open={!!zoomSrc} onOpenChange={(o) => !o && setZoomSrc(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          {zoomSrc && (
            <>
              <div
                className="relative h-[70vh] w-full overflow-hidden bg-black/90 flex items-center justify-center select-none"
                onWheel={onWheel}
                onDoubleClick={onDoubleClick}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={zoomSrc}
                  alt="Zoom"
                  draggable={false}
                  className="max-h-full max-w-full object-contain"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transition: drag.current.active ? "none" : "transform 0.15s ease-out",
                    cursor: zoom > 1 ? "grab" : "zoom-in",
                  }}
                />
                {/* zoom controls */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={() => zoomBy(-0.5)}
                    disabled={zoom <= MIN_ZOOM}
                    aria-label={t("ai.zoom_out")}
                  >
                    <ZoomOut size={16} />
                  </Button>
                  <span className="text-xs text-white w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={() => zoomBy(0.5)}
                    disabled={zoom >= MAX_ZOOM}
                    aria-label={t("ai.zoom_in")}
                  >
                    <ZoomIn size={16} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
