"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { Lightbulb, ArrowBigUp, ListTodo, Trash2, Sparkles, TrendingUp, Clock } from "lucide-react";
import { toast } from "sonner";

interface Idea {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  upvote_count: number;
  admin_remarks: string;
  linked_task_id: string | null;
  created_at: string;
  submitter?: { name: string; photo_url: string | null };
}

const STATUSES = ["all", "open", "reviewing", "approved", "in_progress", "completed", "rejected"];

export default function AdminWishlistPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/wishlist")
      .then((r) => r.json())
      .then((d) => setIdeas(d.ideas || []))
      .catch(() => toast.error("Failed to load ideas"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleUpdateStatus(id: string) {
    setSaving(true);
    const res = await fetch("/api/wishlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "update_status", status: editStatus, admin_remarks: editRemarks }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Idea updated");
      setEditId(null);
      load();
    } else {
      toast.error("Failed to update");
    }
  }

  async function handleConvert(id: string) {
    const res = await fetch("/api/wishlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "convert_to_task" }),
    });
    if (res.ok) {
      const data = await res.json();
      toast.success(`Converted to task ${data.event_id}`);
      load();
    } else {
      toast.error("Failed to convert");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this idea?")) return;
    const res = await fetch(`/api/wishlist?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      setIdeas((prev) => prev.filter((i) => i.id !== id));
    } else {
      toast.error("Failed to delete");
    }
  }

  const filtered = activeTab === "all" ? ideas : ideas.filter((i) => i.status === activeTab);
  const openCount = ideas.filter((i) => i.status === "open").length;
  const topVoted = ideas.length > 0 ? Math.max(...ideas.map((i) => i.upvote_count)) : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Lightbulb className="h-6 w-6 text-amber-500" />
        Ideas Board — Admin
      </h1>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Total Ideas" value={ideas.length} icon={Lightbulb} borderColor="border-l-amber-500" />
        <MetricCard label="Open (Needs Review)" value={openCount} icon={Clock} borderColor="border-l-red-500" />
        <MetricCard label="Top Upvotes" value={topVoted} icon={TrendingUp} borderColor="border-l-blue-500" />
      </div>

      {/* Status Tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const count = s === "all" ? ideas.length : ideas.filter((i) => i.status === s).length;
          if (count === 0 && s !== "all") return null;
          return (
            <button
              key={s}
              onClick={() => setActiveTab(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${
                activeTab === s ? "bg-primary text-primary-foreground shadow-sm" : "bg-card border hover:bg-accent/50"
              }`}
            >
              {s === "all" ? "All" : s.replace("_", " ")}
              <span className="ml-2 text-xs opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Ideas */}
      {filtered.length === 0 ? (
        <EmptyState icon={Lightbulb} title="No ideas" description="No ideas in this category yet." />
      ) : (
        <div className="space-y-3">
          {filtered.map((idea) => (
            <Card key={idea.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4 pb-4">
                <div className="flex gap-3">
                  {/* Vote count */}
                  <div className="flex flex-col items-center justify-center w-14 shrink-0 rounded-xl border bg-muted/30 py-2">
                    <ArrowBigUp size={20} className="text-primary" />
                    <span className="text-sm font-bold text-primary">{idea.upvote_count}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm">{idea.title}</h3>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {idea.category && <Badge variant="outline" className="text-[10px]">{idea.category}</Badge>}
                        <StatusBadge status={idea.status} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{idea.description}</p>

                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      {idea.submitter?.name && <span>by {idea.submitter.name}</span>}
                      <span>{new Date(idea.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                      {idea.linked_task_id && (
                        <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                          <Sparkles size={10} className="mr-0.5" /> Task Created
                        </Badge>
                      )}
                    </div>

                    {/* Admin remarks display */}
                    {idea.admin_remarks && editId !== idea.id && (
                      <div className="mt-2 rounded-lg bg-primary/5 border border-primary/10 p-2">
                        <p className="text-xs text-primary"><span className="font-semibold">Remarks:</span> {idea.admin_remarks}</p>
                      </div>
                    )}

                    {/* Edit panel */}
                    {editId === idea.id ? (
                      <div className="mt-3 p-3 rounded-xl border bg-muted/20 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium">Status</label>
                            <Select value={editStatus} onValueChange={setEditStatus}>
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["open", "reviewing", "approved", "in_progress", "completed", "rejected"].map((s) => (
                                  <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium">Admin Remarks</label>
                          <Textarea value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} placeholder="Add remarks..." rows={2} className="mt-1" />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleUpdateStatus(idea.id)} disabled={saving}>
                            {saving ? "Saving..." : "Save"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" onClick={() => { setEditId(idea.id); setEditStatus(idea.status); setEditRemarks(idea.admin_remarks); }}>
                          Edit Status
                        </Button>
                        {!idea.linked_task_id && (idea.status === "approved" || idea.status === "open" || idea.status === "reviewing") && (
                          <Button size="sm" variant="outline" className="text-primary" onClick={() => handleConvert(idea.id)}>
                            <ListTodo size={14} className="mr-1" /> Convert to Task
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => handleDelete(idea.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
