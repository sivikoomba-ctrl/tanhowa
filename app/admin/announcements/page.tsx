"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Eye, Pencil, Send, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<
    { id: string; title: string; content: string; published: boolean; scheduled_at: string | null; created_at: string }[]
  >([]);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [readCounts, setReadCounts] = useState<Record<string, number>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editScheduleMode, setEditScheduleMode] = useState(false);
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  function load() {
    fetch("/api/announcements")
      .then((r) => r.json())
      .then((d) => setAnnouncements(d.announcements || []))
      .catch(() => toast.error("Failed to load announcements"));
    fetch("/api/announcements/read?counts=true")
      .then((r) => r.json())
      .then((d) => setReadCounts(d.counts || {}))
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const payload: Record<string, unknown> = { title, content };
    if (scheduleMode && scheduledAt) {
      payload.published = false;
      payload.scheduled_at = new Date(scheduledAt).toISOString();
    } else {
      payload.published = true;
    }

    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(scheduleMode && scheduledAt ? "Announcement scheduled" : "Announcement created");
      setTitle("");
      setContent("");
      setScheduleMode(false);
      setScheduledAt("");
      setDialogOpen(false);
      load();
    } else {
      toast.error("Failed to create");
    }
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this announcement?")) return;

    const res = await fetch(`/api/announcements?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      load();
    }
  }

  async function handlePublish(id: string) {
    setPublishingId(id);
    const res = await fetch("/api/announcements", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, published: true }),
    });
    if (res.ok) {
      toast.success("Announcement published");
      load();
    } else {
      toast.error("Failed to publish");
    }
    setPublishingId(null);
  }

  function openEdit(a: { id: string; title: string; content: string; scheduled_at?: string | null }) {
    setEditId(a.id);
    setEditTitle(a.title);
    setEditContent(a.content);
    setEditScheduleMode(!!a.scheduled_at);
    setEditScheduledAt(a.scheduled_at ? new Date(a.scheduled_at).toISOString().slice(0, 16) : "");
    setEditOpen(true);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditLoading(true);
    const editPayload: Record<string, unknown> = { id: editId, title: editTitle, content: editContent };
    if (editScheduleMode && editScheduledAt) {
      editPayload.scheduled_at = new Date(editScheduledAt).toISOString();
      editPayload.published = false;
    } else {
      editPayload.scheduled_at = null;
    }

    const res = await fetch("/api/announcements", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editPayload),
    });
    if (res.ok) {
      toast.success("Announcement updated");
      setEditOpen(false);
      load();
    } else {
      toast.error("Failed to update");
    }
    setEditLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Announcements</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Anyone can freely announce — personal, family functions, official events, or any update to all members.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-1" />
              New Announcement
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Announcement</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div>
                <Label>Content</Label>
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} required />
              </div>
              <div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={!scheduleMode ? "default" : "outline"} className="flex-1" onClick={() => setScheduleMode(false)}>
                    <Send size={14} className="mr-1" /> Publish Now
                  </Button>
                  <Button type="button" size="sm" variant={scheduleMode ? "default" : "outline"} className="flex-1" onClick={() => setScheduleMode(true)}>
                    <Clock size={14} className="mr-1" /> Schedule
                  </Button>
                </div>
                {scheduleMode && (
                  <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-2" required />
                )}
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
                {loading ? "Creating..." : scheduleMode && scheduledAt ? "Schedule Announcement" : "Publish Announcement"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {announcements.map((a) => (
          <Card key={a.id} className={!a.published ? "border-amber-300 bg-amber-50/30" : ""}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{a.title}</h3>
                    {!a.published && !a.scheduled_at && <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]">Draft</Badge>}
                    {a.scheduled_at && !a.published && (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-[10px] gap-1">
                        <Clock size={10} /> {new Date(a.scheduled_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.content}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <p className="text-xs text-muted-foreground">
                      {formatDate(a.created_at)}
                    </p>
                    {a.published && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Eye size={10} /> {readCounts[a.id] || 0} read
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {!a.published && (
                    <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => handlePublish(a.id)} disabled={publishingId === a.id}>
                      <Send size={12} className="mr-1" />{publishingId === a.id ? "..." : "Publish"}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)} className="text-destructive">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Announcement</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            </div>
            <div>
              <Label>Content</Label>
              <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={4} required />
            </div>
            <div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={!editScheduleMode ? "default" : "outline"} className="flex-1" onClick={() => setEditScheduleMode(false)}>
                  <Send size={14} className="mr-1" /> Publish Now
                </Button>
                <Button type="button" size="sm" variant={editScheduleMode ? "default" : "outline"} className="flex-1" onClick={() => setEditScheduleMode(true)}>
                  <Clock size={14} className="mr-1" /> Schedule
                </Button>
              </div>
              {editScheduleMode && (
                <Input type="datetime-local" value={editScheduledAt} onChange={(e) => setEditScheduledAt(e.target.value)} className="mt-2" required />
              )}
            </div>
            <Button type="submit" disabled={editLoading} className="w-full bg-primary hover:bg-primary/90">
              {editLoading ? "Saving..." : editScheduleMode && editScheduledAt ? "Save & Schedule" : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
