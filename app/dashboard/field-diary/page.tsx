"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { NotebookPen, Camera, Mic, Video, Sparkles, X, Loader2, BookOpen, Pencil, Check } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

interface DiaryEntry {
  id: string;
  entry_date: string;
  report_text: string;
  is_success_story: boolean;
  story_status: string;
  created_at: string;
}

interface DiaryMedia {
  id: string;
  media_type: "photo" | "audio" | "video";
  file_name: string;
  signed_url: string;
}

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmtDate(entryDate: string): string {
  return new Date(entryDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const MEDIA_ICON = { photo: Camera, audio: Mic, video: Video } as const;

export default function FieldDiaryPage() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Today's entry: compose form state + whether the form is open (vs. showing a saved read-only summary)
  const [reportText, setReportText] = useState("");
  const [isSuccessStory, setIsSuccessStory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [todayEntry, setTodayEntry] = useState<DiaryEntry | null>(null);
  const [todayEditing, setTodayEditing] = useState(true);
  const [todayMedia, setTodayMedia] = useState<DiaryMedia[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  // History list
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyMedia, setHistoryMedia] = useState<Record<string, DiaryMedia[]>>({});
  const [editingPastId, setEditingPastId] = useState<string | null>(null);
  const [pastDrafts, setPastDrafts] = useState<Record<string, { report_text: string; is_success_story: boolean }>>({});
  const [savingPastId, setSavingPastId] = useState<string | null>(null);

  const t = useT();

  const photoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const loadMedia = useCallback(async (entryId: string) => {
    const res = await fetch(`/api/field-diary/media?entry_id=${entryId}`);
    const d = await res.json();
    return (d.media || []) as DiaryMedia[];
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/field-diary?limit=30")
      .then((r) => r.json())
      .then(async (d) => {
        const list: DiaryEntry[] = d.entries || [];
        setEntries(list);
        const today = todayIST();
        const existing = list.find((e) => e.entry_date === today) || null;
        setTodayEntry(existing);
        if (existing) {
          setReportText(existing.report_text);
          setIsSuccessStory(existing.is_success_story);
          setTodayEditing(false);
          setTodayMedia(await loadMedia(existing.id));
        } else {
          setReportText("");
          setIsSuccessStory(false);
          setTodayEditing(true);
          setTodayMedia([]);
        }
      })
      .catch(() => toast.error("Failed to load your field diary"))
      .finally(() => setLoading(false));
  }, [loadMedia]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!reportText.trim()) {
      toast.error("Report text is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/field-diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_text: reportText.trim(), is_success_story: isSuccessStory }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to save");
        return;
      }
      toast.success(t("fd.saved"));
      setTodayEntry(d.entry);
      setTodayEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  function cancelTodayEdit() {
    if (!todayEntry) return;
    setReportText(todayEntry.report_text);
    setIsSuccessStory(todayEntry.is_success_story);
    setTodayEditing(false);
  }

  async function handleUpload(file: File | null, mediaType: "photo" | "audio" | "video") {
    if (!file || !todayEntry) return;
    setUploading(mediaType);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entry_id", todayEntry.id);
      fd.append("media_type", mediaType);
      const res = await fetch("/api/field-diary/media", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Upload failed");
        return;
      }
      setTodayMedia((prev) => [...prev, d.media]);
    } finally {
      setUploading(null);
    }
  }

  async function handleDeleteMedia(id: string) {
    await fetch(`/api/field-diary/media?id=${id}`, { method: "DELETE" });
    setTodayMedia((prev) => prev.filter((m) => m.id !== id));
  }

  async function toggleExpand(entry: DiaryEntry) {
    if (expandedId === entry.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(entry.id);
    if (!historyMedia[entry.id]) {
      const media = await loadMedia(entry.id);
      setHistoryMedia((prev) => ({ ...prev, [entry.id]: media }));
    }
  }

  function startPastEdit(entry: DiaryEntry) {
    setEditingPastId(entry.id);
    setPastDrafts((prev) => ({ ...prev, [entry.id]: { report_text: entry.report_text, is_success_story: entry.is_success_story } }));
  }

  async function savePastEdit(entryId: string) {
    const draft = pastDrafts[entryId];
    if (!draft?.report_text.trim()) {
      toast.error("Report text is required");
      return;
    }
    setSavingPastId(entryId);
    try {
      const res = await fetch("/api/field-diary", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entryId, report_text: draft.report_text.trim(), is_success_story: draft.is_success_story }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to update");
        return;
      }
      toast.success("Entry updated");
      setEditingPastId(null);
      setEntries((prev) => prev.map((e) => (e.id === entryId ? d.entry : e)));
    } finally {
      setSavingPastId(null);
    }
  }

  const pastEntries = entries.filter((e) => e.id !== todayEntry?.id);

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

      {/* Today's Entry */}
      <Card className="border-primary/20">
        <CardContent className="pt-5 pb-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              {t("fd.today_entry")}
              <Badge variant="outline" className="text-[10px]">{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</Badge>
              {todayEntry && !todayEditing && (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                  <Check size={10} className="mr-0.5" /> Logged
                </Badge>
              )}
            </h2>
            {todayEntry && !todayEditing && (
              <Button variant="ghost" size="sm" onClick={() => setTodayEditing(true)}>
                <Pencil size={14} className="mr-1" /> {t("common.edit")}
              </Button>
            )}
          </div>

          {todayEditing ? (
            <>
              <Textarea
                placeholder={t("fd.report_placeholder")}
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                rows={5}
              />

              <div className="flex items-start gap-2">
                <Checkbox id="success-story" checked={isSuccessStory} onCheckedChange={(v) => setIsSuccessStory(!!v)} className="mt-0.5" />
                <label htmlFor="success-story" className="cursor-pointer">
                  <span className="text-sm font-medium flex items-center gap-1">
                    <Sparkles size={14} className="text-amber-500" /> {t("fd.success_story")}
                  </span>
                  <span className="text-xs text-muted-foreground">{t("fd.success_story_hint")}</span>
                </label>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
                  {saving ? <Loader2 size={16} className="mr-1 animate-spin" /> : null}
                  {t("fd.save")}
                </Button>
                {todayEntry && (
                  <Button variant="outline" onClick={cancelTodayEdit} disabled={saving}>
                    {t("common.cancel")}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm whitespace-pre-wrap">{todayEntry?.report_text}</p>
              {todayEntry?.is_success_story && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]"><Sparkles size={10} className="mr-0.5" /> Success Story</Badge>
              )}
            </div>
          )}

          {todayEntry && (
            <div className="pt-3 border-t space-y-3">
              <div className="flex flex-wrap gap-2">
                <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => handleUpload(e.target.files?.[0] || null, "photo")} />
                <input ref={audioInputRef} type="file" accept="audio/*" hidden onChange={(e) => handleUpload(e.target.files?.[0] || null, "audio")} />
                <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => handleUpload(e.target.files?.[0] || null, "video")} />
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

              {todayMedia.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {todayMedia.map((m) => {
                    const Icon = MEDIA_ICON[m.media_type];
                    return (
                      <div key={m.id} className="relative group">
                        {m.media_type === "photo" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.signed_url} alt={m.file_name} className="h-16 w-16 object-cover rounded-lg border" />
                        ) : (
                          <div className="h-16 w-16 flex flex-col items-center justify-center rounded-lg border bg-muted gap-1">
                            <Icon size={18} className="text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground px-1 truncate max-w-full">{m.file_name}</span>
                          </div>
                        )}
                        <button
                          onClick={() => handleDeleteMedia(m.id)}
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
          )}
        </CardContent>
      </Card>

      {/* My Diary History */}
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <BookOpen size={16} /> {t("fd.my_diary")}
        </h2>
        {pastEntries.length === 0 ? (
          <EmptyState icon={NotebookPen} title={t("fd.no_entries")} description="" />
        ) : (
          <div className="space-y-2">
            {pastEntries.map((entry) => {
              const isEditingThis = editingPastId === entry.id;
              const draft = pastDrafts[entry.id];
              return (
                <Card key={entry.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={`flex-1 min-w-0 ${isEditingThis ? "" : "cursor-pointer"}`}
                        onClick={() => !isEditingThis && toggleExpand(entry)}
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
                        {!isEditingThis && (
                          <p className={`text-sm text-foreground mt-1 ${expandedId === entry.id ? "" : "line-clamp-2"}`}>{entry.report_text}</p>
                        )}
                      </div>
                      {!isEditingThis && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); startPastEdit(entry); }}
                        >
                          <Pencil size={14} />
                        </Button>
                      )}
                    </div>

                    {isEditingThis ? (
                      <div className="space-y-3 mt-3">
                        <Textarea
                          value={draft?.report_text || ""}
                          onChange={(e) => setPastDrafts((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], report_text: e.target.value } }))}
                          rows={4}
                        />
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`success-${entry.id}`}
                            checked={draft?.is_success_story || false}
                            onCheckedChange={(v) => setPastDrafts((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], is_success_story: !!v } }))}
                          />
                          <label htmlFor={`success-${entry.id}`} className="text-xs cursor-pointer flex items-center gap-1">
                            <Sparkles size={12} className="text-amber-500" /> {t("fd.success_story")}
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => savePastEdit(entry.id)} disabled={savingPastId === entry.id}>
                            {savingPastId === entry.id ? <Loader2 size={14} className="mr-1 animate-spin" /> : null} {t("common.save")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingPastId(null)} disabled={savingPastId === entry.id}>
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      expandedId === entry.id && historyMedia[entry.id]?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {historyMedia[entry.id].map((m) => {
                            const Icon = MEDIA_ICON[m.media_type];
                            return m.media_type === "photo" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={m.id} src={m.signed_url} alt={m.file_name} className="h-16 w-16 object-cover rounded-lg border" />
                            ) : (
                              <a key={m.id} href={m.signed_url} target="_blank" rel="noreferrer" className="h-16 w-16 flex flex-col items-center justify-center rounded-lg border bg-muted gap-1">
                                <Icon size={18} className="text-muted-foreground" />
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
    </div>
  );
}
