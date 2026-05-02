"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Calendar,
  History as HistoryIcon,
  Loader2,
  Pencil,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useT, useLang } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";
import { toast } from "sonner";

const OWNER_EMAIL = "tanhowa19791@gmail.com";

interface HistoryEntry {
  id: string;
  event_date: string;
  title: string;
  description: string | null;
  image_url: string | null;
}

interface EditForm {
  id: string;
  event_date: string;
  title: string;
  description: string;
}

function formatDate(iso: string, lang: "en" | "ta") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = lang === "ta" ? "ta-IN" : "en-IN";
  return d.toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" });
}

export default function HistoryPage() {
  const t = useT();
  const { lang } = useLang();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  // Edit dialog state
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  // Lightbox state
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);
  const [zoom, setZoom] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/history${lang === "ta" ? "?lang=ta" : ""}`);
      if (!res.ok) {
        setEntries([]);
        return;
      }
      const data = await res.json();
      setEntries(data.entries || []);
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    load();
  }, [load]);

  // Detect owner once on mount
  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => setIsOwner(d?.user?.email === OWNER_EMAIL))
      .catch(() => {});
  }, []);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox]);

  function openEdit(e: HistoryEntry) {
    setEditForm({
      id: e.id,
      event_date: e.event_date,
      title: e.title,
      description: e.description || "",
    });
  }

  async function saveEdit() {
    if (!editForm) return;
    if (!editForm.event_date || !editForm.title.trim()) {
      toast.error("Date and title are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/history", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editForm.id,
          event_date: editForm.event_date,
          title: editForm.title.trim(),
          description: editForm.description.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Save failed");
        return;
      }
      toast.success("Updated — Tamil auto-translating");
      setEditForm(null);
      await load();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  function openLightbox(url: string, alt: string) {
    setLightbox({ url, alt });
    setZoom(1);
  }

  function cycleZoom() {
    setZoom((z) => (z >= 3 ? 1 : z + 1));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
          <HistoryIcon className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold">{t("history.title")}</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
          {t("history.subtitle")}
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title={t("history.empty_title")}
          description={t("history.empty_desc")}
        />
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div
            className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-primary/20"
            aria-hidden
          />

          <ol className="space-y-8">
            {entries.map((e, i) => {
              const onLeft = i % 2 === 0;
              return (
                <li key={e.id} className="relative">
                  {/* Dot */}
                  <span
                    className="absolute left-4 md:left-1/2 -translate-x-1/2 top-3 w-3 h-3 rounded-full bg-primary ring-4 ring-background"
                    aria-hidden
                  />
                  <div
                    className={`pl-12 md:pl-0 md:flex ${
                      onLeft ? "md:flex-row" : "md:flex-row-reverse"
                    } gap-6 items-start`}
                  >
                    <div className={`md:w-1/2 ${onLeft ? "md:pr-8 md:text-right" : "md:pl-8"}`}>
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary mb-2">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(e.event_date, lang)}
                      </div>
                    </div>
                    <div className={`md:w-1/2 ${onLeft ? "md:pl-8" : "md:pr-8"}`}>
                      <Card className="overflow-hidden relative group">
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => openEdit(e)}
                            className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-background/90 border border-border shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-accent"
                            aria-label="Edit milestone"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {e.image_url && (
                          <button
                            type="button"
                            onClick={() => openLightbox(e.image_url!, e.title)}
                            className="block relative w-full aspect-[16/9] bg-muted cursor-zoom-in group/img"
                            aria-label={`View ${e.title} image full-screen`}
                          >
                            <Image
                              src={e.image_url}
                              alt={e.title}
                              fill
                              className="object-cover transition-transform duration-200 group-hover/img:scale-[1.02]"
                              sizes="(max-width: 768px) 100vw, 480px"
                            />
                            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
                              <ZoomIn className="w-3 h-3" />
                              Zoom
                            </div>
                          </button>
                        )}
                        <CardContent className="p-4">
                          <h3 className="font-semibold text-base mb-1">{e.title}</h3>
                          {e.description && (
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {e.description}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Edit dialog (owner only) */}
      <Dialog open={!!editForm} onOpenChange={(open) => !open && setEditForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Milestone</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-4">
              <div>
                <Label>Event date *</Label>
                <Input
                  type="date"
                  value={editForm.event_date}
                  onChange={(ev) =>
                    setEditForm((f) => (f ? { ...f, event_date: ev.target.value } : f))
                  }
                />
              </div>
              <div>
                <Label>Title *</Label>
                <Input
                  value={editForm.title}
                  onChange={(ev) =>
                    setEditForm((f) => (f ? { ...f, title: ev.target.value } : f))
                  }
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={editForm.description}
                  onChange={(ev) =>
                    setEditForm((f) => (f ? { ...f, description: ev.target.value } : f))
                  }
                  rows={6}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Image edits — open <a href="/admin/history" className="underline text-primary">/admin/history</a>.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditForm(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {saving ? "Saving…" : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 overflow-auto"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Image viewer"
        >
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              setLightbox(null);
            }}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt={lightbox.alt}
            onClick={(ev) => {
              ev.stopPropagation();
              cycleZoom();
            }}
            className="max-w-full max-h-[calc(100vh-3rem)] object-contain transition-transform duration-200 select-none"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "center",
              cursor: zoom >= 3 ? "zoom-out" : "zoom-in",
            }}
            draggable={false}
          />

          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 text-white text-xs px-3 py-2 rounded-full"
            onClick={(ev) => ev.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, z - 1))}
              disabled={zoom <= 1}
              className="p-1 rounded hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="font-mono w-8 text-center">{zoom}×</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, z + 1))}
              disabled={zoom >= 3}
              className="p-1 rounded hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="opacity-70 hidden sm:inline ml-1">· click image to cycle · ESC to close</span>
          </div>
        </div>
      )}
    </div>
  );
}
