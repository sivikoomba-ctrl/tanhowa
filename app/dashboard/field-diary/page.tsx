"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { NotebookPen, Camera, Mic, Video, Sparkles, X, Loader2, BookOpen, Pencil, Trash2, FileText, FileType2, CheckCircle2, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

interface DiaryMedia {
  id: string;
  media_type: "photo" | "audio" | "video";
  file_name: string;
  signed_url: string;
  transcript?: string;
}

interface DiaryEntry {
  id: string;
  entry_date: string;
  report_text: string;
  is_success_story: boolean;
  story_status: string;
  created_at: string;
  media?: DiaryMedia[];
}

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmtDate(entryDate: string): string {
  return new Date(entryDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Mirrors lib/field-diary.ts BACKFILL_WINDOW_DAYS — how far back a backdated entry can be logged.
const BACKFILL_WINDOW_DAYS = 7;

/** Last N calendar days (IST) before today, most recent first. */
function pastDates(n: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    out.push(d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  }
  return out;
}

const MEDIA_ICON = { photo: Camera, audio: Mic, video: Video } as const;

/** Date options for editing an existing entry: today + the backfill window, plus the entry's current date if it's older than that window (so the select always shows the true current value). */
function editDateOptionsFor(currentDate: string): string[] {
  const base = new Set([todayIST(), ...pastDates(BACKFILL_WINDOW_DAYS), currentDate]);
  return Array.from(base).sort().reverse();
}

export default function FieldDiaryPage() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useT();

  // Compose a new entry — members can log more than one entry per day
  // (e.g. a morning visit and an afternoon visit), so this box always
  // starts blank and stays blank after each save, ready for the next entry.
  const [composeDate, setComposeDate] = useState(todayIST());
  const [composeText, setComposeText] = useState("");
  const [composeSuccess, setComposeSuccess] = useState(false);
  const [composeSaving, setComposeSaving] = useState(false);

  // History list: expand / inline edit / media
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [entryMedia, setEntryMedia] = useState<Record<string, DiaryMedia[]>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { report_text: string; is_success_story: boolean; entry_date: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [zoomMedia, setZoomMedia] = useState<DiaryMedia | null>(null);
  const [memberName, setMemberName] = useState("My");
  const [exporting, setExporting] = useState<"pdf" | "word" | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => { if (d?.user?.name) setMemberName(d.user.name); })
      .catch(() => {});
  }, []);

  const loadMedia = useCallback(async (entryId: string) => {
    const res = await fetch(`/api/field-diary/media?entry_id=${entryId}`);
    const d = await res.json();
    return (d.media || []) as DiaryMedia[];
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/field-diary?limit=50")
      .then((r) => r.json())
      .then((d) => {
        const loaded = (d.entries || []) as DiaryEntry[];
        setEntries(loaded);
        // Seed the media map from the embedded data so thumbnails show immediately, no expand needed.
        setEntryMedia((prev) => {
          const next = { ...prev };
          for (const e of loaded) next[e.id] = e.media || [];
          return next;
        });
      })
      .catch(() => toast.error("Failed to load your field diary"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCompose() {
    if (!composeText.trim()) {
      toast.error("Report text is required");
      return;
    }
    setComposeSaving(true);
    try {
      const body: Record<string, unknown> = { report_text: composeText.trim(), is_success_story: composeSuccess };
      if (composeDate !== todayIST()) body.entry_date = composeDate;

      const res = await fetch("/api/field-diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to save");
        return;
      }
      toast.success(t("fd.saved"));
      setEntries((prev) => [d.entry, ...prev]);
      setEntryMedia((prev) => ({ ...prev, [d.entry.id]: [] }));

      // Reset the compose box — ready for the next entry.
      setComposeText("");
      setComposeSuccess(false);
      setComposeDate(todayIST());

      // Open the freshly created entry in edit mode so photos/audio/video can be attached right away.
      setEditingId(d.entry.id);
      setDrafts((prev) => ({ ...prev, [d.entry.id]: { report_text: d.entry.report_text, is_success_story: d.entry.is_success_story, entry_date: d.entry.entry_date } }));
      setExpandedId(d.entry.id);
    } finally {
      setComposeSaving(false);
    }
  }

  async function toggleExpand(entry: DiaryEntry) {
    if (expandedId === entry.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(entry.id);
    if (!entryMedia[entry.id]) {
      const media = await loadMedia(entry.id);
      setEntryMedia((prev) => ({ ...prev, [entry.id]: media }));
    }
  }

  async function startEdit(entry: DiaryEntry) {
    setEditingId(entry.id);
    setDrafts((prev) => ({ ...prev, [entry.id]: { report_text: entry.report_text, is_success_story: entry.is_success_story, entry_date: entry.entry_date } }));
    setExpandedId(entry.id);
    if (!entryMedia[entry.id]) {
      const media = await loadMedia(entry.id);
      setEntryMedia((prev) => ({ ...prev, [entry.id]: media }));
    }
  }

  async function saveEdit(entryId: string) {
    const draft = drafts[entryId];
    if (!draft?.report_text.trim()) {
      toast.error("Report text is required");
      return;
    }
    setSavingId(entryId);
    try {
      const res = await fetch("/api/field-diary", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entryId, report_text: draft.report_text.trim(), is_success_story: draft.is_success_story, entry_date: draft.entry_date }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to update");
        return;
      }
      toast.success("Entry updated");
      setEditingId(null);
      const original = entries.find((e) => e.id === entryId);
      if (original && original.entry_date !== draft.entry_date) {
        load(); // date changed — reload so the list re-sorts into the right date order
      } else {
        setEntries((prev) => prev.map((e) => (e.id === entryId ? d.entry : e)));
      }
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(entryId: string) {
    if (!confirm("Delete this diary entry? This cannot be undone.")) return;
    setDeletingId(entryId);
    try {
      const res = await fetch(`/api/field-diary?id=${entryId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Failed to delete");
        return;
      }
      toast.success("Entry deleted");
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      if (editingId === entryId) setEditingId(null);
      if (expandedId === entryId) setExpandedId(null);
    } finally {
      setDeletingId(null);
    }
  }

  async function uploadOne(entryId: string, file: File, mediaType: "photo" | "audio" | "video"): Promise<boolean> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entry_id", entryId);
    fd.append("media_type", mediaType);
    const res = await fetch("/api/field-diary/media", { method: "POST", body: fd });
    const d = await res.json();
    if (!res.ok) {
      toast.error(d.error || `Upload failed: ${file.name}`);
      return false;
    }
    setEntryMedia((prev) => ({ ...prev, [entryId]: [...(prev[entryId] || []), d.media] }));
    return true;
  }

  /** Photos can be multi-selected; uploads run one at a time so per-entry caps and errors are handled cleanly. */
  async function handleUpload(entryId: string, files: FileList | null, mediaType: "photo" | "audio" | "video") {
    if (!files || files.length === 0) return;
    setUploading(mediaType);
    try {
      for (const file of Array.from(files)) {
        const ok = await uploadOne(entryId, file, mediaType);
        if (!ok) break; // stop on first failure (e.g. cap reached) rather than spamming more errors
      }
    } finally {
      setUploading(null);
    }
  }

  async function handleDeleteMedia(entryId: string, mediaId: string) {
    await fetch(`/api/field-diary/media?id=${mediaId}`, { method: "DELETE" });
    setEntryMedia((prev) => ({ ...prev, [entryId]: (prev[entryId] || []).filter((m) => m.id !== mediaId) }));
    if (zoomMedia?.id === mediaId) setZoomMedia(null);
  }

  function currentExportEntries() {
    return entries.map((e) => ({ ...e, media: entryMedia[e.id] || e.media || [] }));
  }

  async function handleExportPDF() {
    setExporting("pdf");
    try {
      const { exportFieldDiaryPDF } = await import("@/lib/field-diary-export");
      await exportFieldDiaryPDF(currentExportEntries(), memberName);
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setExporting(null);
    }
  }

  async function handleExportDocx() {
    setExporting("word");
    try {
      const { exportFieldDiaryDocx } = await import("@/lib/field-diary-export");
      await exportFieldDiaryDocx(currentExportEntries(), memberName);
    } catch {
      toast.error("Failed to generate Word document");
    } finally {
      setExporting(null);
    }
  }

  const composeDateOptions = [todayIST(), ...pastDates(BACKFILL_WINDOW_DAYS)];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-40 bg-muted rounded-xl animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <NotebookPen className="h-6 w-6 text-primary" />
          {t("fd.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("fd.subtitle")}</p>
      </div>

      {/* Compose a new entry */}
      <Card className="border-primary/20">
        <CardContent className="pt-5 pb-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("fd.today_entry")}</h2>
            <select
              value={composeDate}
              onChange={(e) => setComposeDate(e.target.value)}
              className="px-2 py-1.5 border rounded-lg text-xs bg-background"
            >
              {composeDateOptions.map((d) => (
                <option key={d} value={d}>{d === todayIST() ? t("fd.today") : fmtDate(d)}</option>
              ))}
            </select>
          </div>

          <Textarea
            placeholder={t("fd.report_placeholder")}
            value={composeText}
            onChange={(e) => setComposeText(e.target.value)}
            rows={5}
          />

          <div className="flex items-start gap-2">
            <Checkbox id="compose-success" checked={composeSuccess} onCheckedChange={(v) => setComposeSuccess(!!v)} className="mt-0.5" />
            <label htmlFor="compose-success" className="cursor-pointer">
              <span className="text-sm font-medium flex items-center gap-1">
                <Sparkles size={14} className="text-amber-500" /> {t("fd.success_story")}
              </span>
              <span className="text-xs text-muted-foreground">{t("fd.success_story_hint")}</span>
            </label>
          </div>

          <Button onClick={handleCompose} disabled={composeSaving} className="bg-primary hover:bg-primary/90">
            {composeSaving ? <Loader2 size={16} className="mr-1 animate-spin" /> : null}
            {t("fd.add_entry")}
          </Button>
        </CardContent>
      </Card>

      {/* My Diary */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <BookOpen size={16} /> {t("fd.my_diary")}
          </h2>
          {entries.length > 0 && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={exporting !== null} onClick={handleExportPDF}>
                {exporting === "pdf" ? <Loader2 size={14} className="mr-1 animate-spin" /> : <FileText size={14} className="mr-1" />} PDF
              </Button>
              <Button variant="outline" size="sm" disabled={exporting !== null} onClick={handleExportDocx}>
                {exporting === "word" ? <Loader2 size={14} className="mr-1 animate-spin" /> : <FileType2 size={14} className="mr-1" />} Word
              </Button>
            </div>
          )}
        </div>
        {entries.length === 0 ? (
          <EmptyState icon={NotebookPen} title={t("fd.no_entries")} description="" />
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => {
              const isEditing = editingId === entry.id;
              const draft = drafts[entry.id];
              return (
                <Card key={entry.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={`flex-1 min-w-0 ${isEditing ? "" : "cursor-pointer"}`}
                        onClick={() => !isEditing && toggleExpand(entry)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-muted-foreground">{fmtDate(entry.entry_date)}</span>
                          {entry.is_success_story && (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]"><Sparkles size={10} className="mr-0.5" /> Success Story</Badge>
                          )}
                          {entry.story_status === "published" && (
                            <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">Published</Badge>
                          )}
                        </div>
                        {!isEditing && (
                          <p className={`text-sm text-foreground mt-1 ${expandedId === entry.id ? "" : "line-clamp-2"}`}>{entry.report_text}</p>
                        )}
                      </div>
                      {!isEditing && (
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); startEdit(entry); }}>
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }} disabled={deletingId === entry.id}>
                            {deletingId === entry.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </Button>
                        </div>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-3 mt-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-muted-foreground">Entry date</label>
                          <select
                            value={draft?.entry_date || entry.entry_date}
                            onChange={(e) => setDrafts((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], entry_date: e.target.value } }))}
                            className="px-2 py-1.5 border rounded-lg text-xs bg-background"
                          >
                            {editDateOptionsFor(entry.entry_date).map((d) => (
                              <option key={d} value={d}>{d === todayIST() ? t("fd.today") : fmtDate(d)}</option>
                            ))}
                          </select>
                        </div>
                        <Textarea
                          value={draft?.report_text || ""}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], report_text: e.target.value } }))}
                          rows={4}
                        />
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`success-${entry.id}`}
                            checked={draft?.is_success_story || false}
                            onCheckedChange={(v) => setDrafts((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], is_success_story: !!v } }))}
                          />
                          <label htmlFor={`success-${entry.id}`} className="text-xs cursor-pointer flex items-center gap-1">
                            <Sparkles size={12} className="text-amber-500" /> {t("fd.success_story")}
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit(entry.id)} disabled={savingId === entry.id}>
                            {savingId === entry.id ? <Loader2 size={14} className="mr-1 animate-spin" /> : null} {t("common.save")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={savingId === entry.id}>
                            {t("common.cancel")}
                          </Button>
                        </div>

                        <div className="pt-3 border-t space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <input
                              ref={photoInputRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              multiple
                              hidden
                              onChange={(e) => { handleUpload(entry.id, e.target.files, "photo"); e.target.value = ""; }}
                            />
                            <input
                              ref={audioInputRef}
                              type="file"
                              accept="audio/*"
                              hidden
                              onChange={(e) => { handleUpload(entry.id, e.target.files, "audio"); e.target.value = ""; }}
                            />
                            <input
                              ref={videoInputRef}
                              type="file"
                              accept="video/mp4,video/webm,video/quicktime"
                              hidden
                              onChange={(e) => { handleUpload(entry.id, e.target.files, "video"); e.target.value = ""; }}
                            />
                            <Button type="button" variant="outline" size="sm" disabled={uploading === "photo"} onClick={() => photoInputRef.current?.click()}>
                              {uploading === "photo" ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Camera size={14} className="mr-1" />} {t("fd.add_photo")}
                            </Button>
                            <Button type="button" variant="outline" size="sm" disabled={uploading === "audio"} onClick={() => audioInputRef.current?.click()}>
                              {uploading === "audio" ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Mic size={14} className="mr-1" />} {t("fd.add_audio")}
                            </Button>
                            <Button type="button" variant="outline" size="sm" disabled={uploading === "video"} onClick={() => videoInputRef.current?.click()}>
                              {uploading === "video" ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Video size={14} className="mr-1" />} {t("fd.add_video")}
                            </Button>
                          </div>

                          {(entryMedia[entry.id]?.length || 0) > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {entryMedia[entry.id].map((m) => {
                                const Icon = MEDIA_ICON[m.media_type];
                                return (
                                  <div key={m.id} className="relative group">
                                    {m.media_type === "photo" ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={m.signed_url}
                                        alt={m.file_name}
                                        className="h-16 w-16 object-cover rounded-lg border cursor-zoom-in"
                                        onClick={() => setZoomMedia(m)}
                                      />
                                    ) : (
                                      <div className="h-16 w-16 flex flex-col items-center justify-center rounded-lg border bg-muted gap-1">
                                        <Icon size={18} className="text-muted-foreground" />
                                        <span className="text-[9px] text-muted-foreground px-1 truncate max-w-full">{m.file_name}</span>
                                        {m.media_type === "audio" && m.transcript && (
                                          <CheckCircle2 size={10} className="absolute top-0.5 left-0.5 text-green-600" />
                                        )}
                                      </div>
                                    )}
                                    <button
                                      onClick={() => handleDeleteMedia(entry.id, m.id)}
                                      className="absolute -top-1.5 -right-1.5 bg-white rounded-full border shadow p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      (entryMedia[entry.id]?.length || 0) > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {entryMedia[entry.id].map((m) => {
                            const Icon = MEDIA_ICON[m.media_type];
                            return m.media_type === "photo" ? (
                              <div key={m.id} className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={m.signed_url}
                                  alt={m.file_name}
                                  className="h-16 w-16 object-cover rounded-lg border cursor-zoom-in"
                                  onClick={(e) => { e.stopPropagation(); setZoomMedia(m); }}
                                />
                                <ZoomIn size={12} className="absolute bottom-0.5 right-0.5 text-white drop-shadow" />
                              </div>
                            ) : (
                              <a
                                key={m.id}
                                href={m.signed_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="relative h-16 w-16 flex flex-col items-center justify-center rounded-lg border bg-muted gap-1"
                              >
                                <Icon size={18} className="text-muted-foreground" />
                                {m.media_type === "audio" && m.transcript && (
                                  <CheckCircle2 size={10} className="absolute top-0.5 left-0.5 text-green-600" />
                                )}
                              </a>
                            );
                          })}
                        </div>
                      )
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!zoomMedia} onOpenChange={(open) => !open && setZoomMedia(null)}>
        <DialogContent className="max-w-3xl p-2 bg-black/95 border-none">
          <DialogTitle className="sr-only">{zoomMedia?.file_name || "Photo"}</DialogTitle>
          {zoomMedia && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={zoomMedia.signed_url} alt={zoomMedia.file_name} className="w-full max-h-[80vh] object-contain rounded" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
