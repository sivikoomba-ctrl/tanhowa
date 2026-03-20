"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Megaphone, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  users?: { name: string };
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);

  function loadAnnouncements() {
    fetch("/api/announcements")
      .then((r) => r.json())
      .then((d) => setAnnouncements(d.announcements || []))
      .catch(() => {});
  }

  useEffect(() => {
    loadAnnouncements();
    // Check if user is admin or official
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          const r = d.user.role;
          const o = d.user.official_type;
          if (r === "admin" || r === "super_admin" || o === "state" || o === "district") {
            setCanCreate(true);
          }
        }
      })
      .catch(() => {});
  }, []);

  async function handleCreate() {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setCreating(true);
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), content: content.trim(), published: true }),
    });
    setCreating(false);
    if (res.ok) {
      toast.success("Announcement published");
      setShowCreate(false);
      setTitle("");
      setContent("");
      loadAnnouncements();
    } else {
      toast.error("Failed to create announcement");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Announcements</h1>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90">
            <Plus size={16} className="mr-1" />New Announcement
          </Button>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Announcement</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder="Content" value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
            <Button onClick={handleCreate} disabled={creating} className="w-full bg-primary hover:bg-primary/90">
              {creating ? "Publishing..." : "Publish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {announcements.length === 0 ? (
        <div className="text-center py-12">
          <Megaphone className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No announcements yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => (
            <Card key={a.id}>
              <CardContent className="pt-4">
                <h2 className="text-lg font-semibold">{a.title}</h2>
                <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{a.content}</p>
                <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                  <span>{formatDate(a.created_at)}</span>
                  {a.users?.name && (
                    <>
                      <span>&middot;</span>
                      <span>by {a.users.name}</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
