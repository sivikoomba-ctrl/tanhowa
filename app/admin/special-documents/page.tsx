"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Trash2, FileText, Download, Search, FolderOpen, File,
  FileImage, FileSpreadsheet, Pencil, Lock, Eye,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

const CATEGORIES = [
  "General", "Legal", "Finance", "HR", "Contracts", "Reports",
  "Correspondence", "Policies", "Minutes", "Confidential", "Other",
];

function getFileIcon(type: string | null) {
  if (!type) return File;
  if (type.includes("image")) return FileImage;
  if (type.includes("pdf")) return FileText;
  if (type.includes("sheet") || type.includes("excel") || type.includes("csv")) return FileSpreadsheet;
  return File;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

interface AdminDoc {
  id: string;
  title: string;
  description: string | null;
  category: string;
  file_url: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

export default function SpecialDocumentsPage() {
  const [docs, setDocs] = useState<AdminDoc[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<AdminDoc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "General", file: null as File | null });
  const [loaded, setLoaded] = useState(false);

  function load() {
    fetch("/api/admin-documents")
      .then((r) => r.json())
      .then((d) => setDocs(d.documents || []))
      .catch(() => toast.error("Failed to load documents"))
      .finally(() => setLoaded(true));
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      const matchSearch = !search ||
        d.title.toLowerCase().includes(search.toLowerCase()) ||
        d.description?.toLowerCase().includes(search.toLowerCase()) ||
        d.file_name?.toLowerCase().includes(search.toLowerCase());
      const matchCat = categoryFilter === "all" || d.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [docs, search, categoryFilter]);

  const categories = useMemo(() => {
    const cats = new Set(docs.map((d) => d.category));
    return Array.from(cats).sort();
  }, [docs]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.file) { toast.error("Please select a file"); return; }

    setUploading(true);
    const formData = new FormData();
    formData.append("title", form.title);
    formData.append("description", form.description);
    formData.append("category", form.category);
    formData.append("file", form.file);

    const res = await fetch("/api/admin-documents", { method: "POST", body: formData });
    if (res.ok) {
      toast.success("Document uploaded");
      setForm({ title: "", description: "", category: "General", file: null });
      setUploadOpen(false);
      load();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Upload failed");
    }
    setUploading(false);
  }

  async function handleEditSave() {
    if (!editDoc) return;
    const res = await fetch("/api/admin-documents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editDoc.id, title: editDoc.title, description: editDoc.description, category: editDoc.category }),
    });
    if (res.ok) {
      toast.success("Updated");
      setEditDoc(null);
      load();
    } else {
      toast.error("Update failed");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this document permanently?")) return;
    const res = await fetch(`/api/admin-documents?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Special Document Vault</h1>
            <Badge variant="outline" className="text-xs gap-1"><Lock size={10} />Private</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{docs.length} documents — visible only to you</p>
        </div>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-1" />Upload
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Upload Private Document</DialogTitle></DialogHeader>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Document title" required className="mt-1" />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional notes..." rows={2} className="mt-1" />
              </div>
              <div>
                <Label>File *</Label>
                <Input type="file" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })} className="mt-1" required />
              </div>
              <Button type="submit" disabled={uploading} className="w-full bg-primary hover:bg-primary/90">
                {uploading ? "Uploading..." : "Upload Document"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search & Filter */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Documents */}
      {filtered.length === 0 && loaded ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <FolderOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {docs.length === 0 ? "No documents yet. Upload your first private document." : "No documents match your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => {
            const Icon = getFileIcon(doc.file_type);
            return (
              <Card key={doc.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-sm truncate">{doc.title}</h3>
                        <Badge variant="outline" className="text-[10px] py-0">{doc.category}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {doc.file_name && <span className="truncate max-w-[200px]">{doc.file_name}</span>}
                        {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                        <span>{formatDate(doc.created_at)}</span>
                      </div>
                      {doc.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{doc.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" asChild>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"><Eye size={14} /></a>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" asChild>
                        <a href={doc.file_url} download={doc.file_name || "document"}><Download size={14} /></a>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditDoc(doc)}>
                        <Pencil size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => handleDelete(doc.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editDoc} onOpenChange={(v) => !v && setEditDoc(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Document</DialogTitle></DialogHeader>
          {editDoc && (
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={editDoc.title} onChange={(e) => setEditDoc({ ...editDoc, title: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={editDoc.category} onValueChange={(v) => setEditDoc({ ...editDoc, category: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={editDoc.description || ""} onChange={(e) => setEditDoc({ ...editDoc, description: e.target.value })} rows={2} className="mt-1" />
              </div>
              <Button onClick={handleEditSave} className="w-full bg-primary hover:bg-primary/90">Save Changes</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
