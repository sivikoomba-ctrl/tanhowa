"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Sparkles, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface StoryPhoto {
  id: string;
  signed_url: string;
}

interface StoryEntry {
  id: string;
  entry_date: string;
  district: string | null;
  report_text: string;
  story_draft_title: string;
  story_draft_body: string;
  story_generated_at: string;
  member: { id: string; name: string; photo_url: string | null; occupation: string | null } | null;
  photos: StoryPhoto[];
}

export default function FieldDiaryStoriesPage() {
  const [entries, setEntries] = useState<StoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { title: string; body: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/field-diary/stories")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        const list: StoryEntry[] = d.entries || [];
        setEntries(list);
        setDrafts(Object.fromEntries(list.map((e) => [e.id, { title: e.story_draft_title, body: e.story_draft_body }])));
      })
      .catch((e) => toast.error(e.message || "Failed to load story queue"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handlePublish(entry: StoryEntry) {
    const draft = drafts[entry.id];
    if (!draft?.title.trim() || !draft?.body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    setBusyId(entry.id);
    try {
      const res = await fetch("/api/field-diary/stories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, action: "publish", edits: draft }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to publish");
        return;
      }
      toast.success("Published as an announcement");
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(entry: StoryEntry) {
    setBusyId(entry.id);
    try {
      const res = await fetch("/api/field-diary/stories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, action: "dismiss" }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Failed to dismiss");
        return;
      }
      toast.success("Dismissed");
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-amber-100 rounded-xl">
          <Sparkles className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Field Diary Success Stories</h1>
          <p className="text-sm text-muted-foreground">AI-drafted announcement suggestions from members&apos; diary entries — review before publishing</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState icon={Sparkles} title="No stories awaiting review" description="Drafts appear here automatically when a member flags a success story or writes a long entry." />
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="pt-5 pb-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{entry.member?.name || "Unknown member"}</span>
                      {entry.member?.occupation && <Badge variant="outline" className="text-[10px]">{entry.member.occupation}</Badge>}
                      {entry.district && <Badge variant="outline" className="text-[10px]">{entry.district}</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.entry_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Original diary entry</p>
                  <p className="text-sm whitespace-pre-wrap">{entry.report_text}</p>
                  {entry.photos.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {entry.photos.map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p.id} src={p.signed_url} alt="" className="h-16 w-16 object-cover rounded-lg border" />
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t pt-4">
                  <p className="text-xs font-semibold text-amber-600 flex items-center gap-1"><Sparkles size={12} /> AI-drafted announcement (edit before publishing)</p>
                  <Input
                    value={drafts[entry.id]?.title || ""}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], title: e.target.value } }))}
                    placeholder="Announcement title"
                  />
                  <Textarea
                    value={drafts[entry.id]?.body || ""}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], body: e.target.value } }))}
                    rows={6}
                    placeholder="Announcement body"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => handlePublish(entry)} disabled={busyId === entry.id} className="bg-primary hover:bg-primary/90">
                    {busyId === entry.id ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Check size={14} className="mr-1" />} Publish as Announcement
                  </Button>
                  <Button variant="outline" onClick={() => handleDismiss(entry)} disabled={busyId === entry.id}>
                    <X size={14} className="mr-1" /> Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
