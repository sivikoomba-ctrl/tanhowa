"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Lock, Plus, Download, Trash2, FileText, Search, Upload } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

interface ProjectHDoc {
  id: string;
  title: string;
  description: string;
  category: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  created_at: string;
  signed_url: string;
  uploader?: { name?: string; email?: string };
}

const CATEGORIES = [
  "Policy Drafts",
  "Position Papers",
  "Cabinet Notes",
  "Reports",
  "Correspondence",
  "Meeting Minutes",
  "Other",
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectHPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [docs, setDocs] = useState<ProjectHDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showUpload, setShowUpload] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Upload form
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("Policy Drafts");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.is_project_h) {
          setAllowed(false);
          router.push("/dashboard");
          return;
        }
        setAllowed(true);
        setCurrentUserId(d.user?.id || "");
        setIsSuperAdmin(d.user?.role === "super_admin");
      })
      .catch(() => router.push("/dashboard"));
  }, [router]);

  useEffect(() => {
    if (allowed !== true) return;
    fetch("/api/project-h")
      .then((r) => r.json())
      .then((d) => setDocs(d.documents || []))
      .catch(() => toast.error("Failed to load documents"))
      .finally(() => setLoaded(true));
  }, [allowed]);

  const filtered = useMemo(() => {
    let list = docs;
    if (filterCategory !== "all") list = list.filter((d) => d.category === filterCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          d.file_name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [docs, search, filterCategory]);

  async function handleUpload() {
    if (!file) {
      toast.error("Pick a file first");
      return;
    }
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title.trim());
      fd.append("description", description.trim());
      fd.append("category", category);

      const res = await fetch("/api/project-h", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      toast.success("Document uploaded");
      setShowUpload(false);
      setFile(null);
      setTitle("");
      setDescription("");
      setCategory("Policy Drafts");
      // Reload list
      const list = await fetch("/api/project-h").then((r) => r.json());
      setDocs(list.documents || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: ProjectHDoc) {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/project-h?id=${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
      toast.success("Deleted");
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (allowed === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (allowed === false) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Lock size={20} className="text-amber-600" />
            <h1 className="text-2xl font-bold">Project H</h1>
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">TT Team only</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Restricted policy document vault. Visible only to TT Team members.
          </p>
        </div>
        <Button onClick={() => setShowUpload(true)} className="gap-2">
          <Plus size={16} />Upload Document
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search title, description, file name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!loaded ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={docs.length === 0 ? "No documents yet" : "No matches"}
          description={docs.length === 0 ? "Upload the first policy document to get started." : "Try a different search or category."}
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((d) => {
            const canDelete = d.uploaded_by === currentUserId || isSuperAdmin;
            return (
              <Card key={d.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex flex-wrap items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-sm">{d.title}</h3>
                      <Badge variant="outline" className="text-[10px]">{d.category}</Badge>
                    </div>
                    {d.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.description}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
                      <span className="truncate max-w-[200px]">{d.file_name}</span>
                      <span>{formatSize(d.file_size)}</span>
                      <span>{new Date(d.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                      {d.uploader?.name && <span>by {d.uploader.name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.signed_url && (
                      <Button asChild size="sm" variant="outline" className="gap-1.5">
                        <a href={d.signed_url} target="_blank" rel="noopener noreferrer" download={d.file_name}>
                          <Download size={14} />Download
                        </a>
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(d)}
                        aria-label="Delete document"
                      >
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload size={18} />Upload Document
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>File (max 50MB)</Label>
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Draft policy note – Floriculture exports" />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowUpload(false)} disabled={uploading}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
