"use client";

import { useEffect, useRef, useState } from "react";
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
  Plus,
  Pencil,
  Trash2,
  Calendar,
  ImagePlus,
  Loader2,
  Lock,
  History as HistoryIcon,
} from "lucide-react";
import { toast } from "sonner";

interface HistoryEntry {
  id: string;
  event_date: string;
  title: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
}

interface FormState {
  id: string | null;
  event_date: string;
  title: string;
  description: string;
  image_url: string;
}

const blankForm: FormState = {
  id: null,
  event_date: "",
  title: "",
  description: "",
  image_url: "",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

export default function AdminHistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/history");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      setEntries(data.entries || []);
    } catch {
      toast.error("Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => setCanDelete(d?.user?.role === "super_admin"))
      .catch(() => {});
  }, []);

  function startCreate() {
    setForm({ ...blankForm, event_date: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  }

  function startEdit(e: HistoryEntry) {
    setForm({
      id: e.id,
      event_date: e.event_date,
      title: e.title,
      description: e.description || "",
      image_url: e.image_url || "",
    });
    setOpen(true);
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/history/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Upload failed");
        return;
      }
      setForm((f) => ({ ...f, image_url: data.url }));
      toast.success("Image uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form.event_date || !form.title.trim()) {
      toast.error("Date and title are required");
      return;
    }
    setSaving(true);
    try {
      const isEdit = !!form.id;
      const res = await fetch("/api/history", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          event_date: form.event_date,
          title: form.title.trim(),
          description: form.description.trim() || null,
          image_url: form.image_url || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Save failed");
        return;
      }
      toast.success(isEdit ? "Entry updated — Tamil auto-translating" : "Entry created — Tamil auto-translating");
      setOpen(false);
      setForm(blankForm);
      await load();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this entry?")) return;
    try {
      const res = await fetch(`/api/history?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Delete failed");
        return;
      }
      toast.success("Deleted");
      await load();
    } catch {
      toast.error("Delete failed");
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
            <p className="text-sm text-muted-foreground">
              Editing TANHOWA History is reserved for the State-Admin only.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HistoryIcon className="w-6 h-6 text-primary" />
            TANHOWA History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Curated milestones — visible to all members at /dashboard/history. Tamil auto-translates on save.
          </p>
        </div>
        <Button onClick={startCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Milestone
        </Button>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No milestones yet — click <strong>Add Milestone</strong> to create the first one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <Card key={e.id}>
              <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
                {e.image_url && (
                  <div className="relative w-full sm:w-40 aspect-[16/9] sm:aspect-square rounded-md overflow-hidden bg-muted shrink-0">
                    <Image
                      src={e.image_url}
                      alt={e.title}
                      fill
                      className="object-cover"
                      sizes="160px"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary mb-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(e.event_date)}
                  </div>
                  <h3 className="font-semibold mb-1">{e.title}</h3>
                  {e.description && (
                    <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                      {e.description}
                    </p>
                  )}
                </div>
                <div className="flex sm:flex-col gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => startEdit(e)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  {canDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => remove(e.id)}
                      className="text-destructive hover:text-destructive"
                      title="Delete (State-Admin only)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>{form.id ? "Edit Milestone" : "Add Milestone"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div>
              <Label>Event date *</Label>
              <Input
                type="date"
                value={form.event_date}
                onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
              />
            </div>
            <div>
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. TANHOWA founded"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What happened, who was involved, why it mattered…"
                rows={5}
              />
            </div>
            <div>
              <Label>Image (optional)</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage(f);
                  e.target.value = "";
                }}
              />
              {form.image_url ? (
                <div className="mt-2 relative w-full max-h-48 rounded-md overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.image_url} alt="" className="w-full h-auto max-h-48 object-contain" />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ImagePlus className="w-4 h-4 mr-2" />
                  )}
                  {uploading ? "Uploading…" : "Upload Image"}
                </Button>
              )}
              <p className="text-xs text-muted-foreground mt-1">JPG/PNG, max 5MB.</p>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {saving ? "Saving…" : form.id ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
