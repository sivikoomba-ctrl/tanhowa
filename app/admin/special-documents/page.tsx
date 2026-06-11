"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Trash2, FileText, Download, Search, FolderOpen, File,
  FileImage, FileSpreadsheet, Pencil, Lock, Eye, Folder as FolderIcon,
  FolderPlus, ChevronLeft, Inbox,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

const UNFILED = "unfiled";

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

interface VaultFolder {
  id: string;
  name: string;
  doc_count: number;
  created_at: string;
}

interface AdminDoc {
  id: string;
  title: string;
  description: string | null;
  category: string;
  folder_id: string | null;
  file_url: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

export default function SpecialDocumentsPage() {
  const [docs, setDocs] = useState<AdminDoc[]>([]);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<AdminDoc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", folderId: UNFILED, file: null as File | null });
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameFolder, setRenameFolder] = useState<VaultFolder | null>(null);
  const [loaded, setLoaded] = useState(false);

  function load() {
    Promise.all([
      fetch("/api/admin-documents").then((r) => r.json()),
      fetch("/api/admin-documents/folders").then((r) => r.json()),
    ])
      .then(([d, f]) => {
        setDocs(d.documents || []);
        setFolders(f.folders || []);
        setUnfiledCount(f.unfiled_count || 0);
      })
      .catch(() => toast.error("Failed to load documents"))
      .finally(() => setLoaded(true));
  }

  useEffect(() => { load(); }, []);

  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  const searching = search.trim().length > 0;

  const visibleDocs = useMemo(() => {
    let list = docs;
    if (!searching && activeFolder) {
      list = activeFolder === UNFILED
        ? docs.filter((d) => !d.folder_id)
        : docs.filter((d) => d.folder_id === activeFolder);
    } else if (searching) {
      const q = search.toLowerCase();
      list = docs.filter((d) =>
        d.title.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q) ||
        d.file_name?.toLowerCase().includes(q)
      );
      if (activeFolder) {
        list = activeFolder === UNFILED
          ? list.filter((d) => !d.folder_id)
          : list.filter((d) => d.folder_id === activeFolder);
      }
    }
    return list;
  }, [docs, activeFolder, search, searching]);

  const activeFolderName = activeFolder === UNFILED ? "Unfiled" : (activeFolder ? folderMap.get(activeFolder) : null);

  function openUpload() {
    setForm({ title: "", description: "", folderId: activeFolder || UNFILED, file: null });
    setUploadOpen(true);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.file) { toast.error("Please select a file"); return; }

    setUploading(true);
    const formData = new FormData();
    formData.append("title", form.title);
    formData.append("description", form.description);
    if (form.folderId !== UNFILED) formData.append("folder_id", form.folderId);
    formData.append("file", form.file);

    const res = await fetch("/api/admin-documents", { method: "POST", body: formData });
    if (res.ok) {
      toast.success("Document uploaded");
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
      body: JSON.stringify({
        id: editDoc.id,
        title: editDoc.title,
        description: editDoc.description,
        folder_id: editDoc.folder_id,
      }),
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

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const res = await fetch("/api/admin-documents/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolderName }),
    });
    if (res.ok) {
      toast.success("Folder created");
      setNewFolderName("");
      setNewFolderOpen(false);
      load();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to create folder");
    }
  }

  async function handleRenameFolder() {
    if (!renameFolder || !renameFolder.name.trim()) return;
    const res = await fetch("/api/admin-documents/folders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: renameFolder.id, name: renameFolder.name }),
    });
    if (res.ok) {
      toast.success("Folder renamed");
      setRenameFolder(null);
      load();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Rename failed");
    }
  }

  async function handleDeleteFolder(f: VaultFolder) {
    const msg = f.doc_count > 0
      ? `Delete folder "${f.name}"? Its ${f.doc_count} document(s) will move to Unfiled.`
      : `Delete empty folder "${f.name}"?`;
    if (!confirm(msg)) return;
    const res = await fetch(`/api/admin-documents/folders?id=${f.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Folder deleted");
      if (activeFolder === f.id) setActiveFolder(null);
      load();
    } else {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            {activeFolder && (
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 -ml-2" onClick={() => setActiveFolder(null)}>
                <ChevronLeft size={18} />
              </Button>
            )}
            <h1 className="text-2xl font-bold">
              {activeFolderName || "Special Document Vault"}
            </h1>
            <Badge variant="outline" className="text-xs gap-1"><Lock size={10} />Private</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {searching
              ? `${visibleDocs.length} match(es)${activeFolderName ? ` in ${activeFolderName}` : ""}`
              : activeFolderName
              ? `${visibleDocs.length} document(s) in this folder`
              : `${docs.length} documents in ${folders.length} folders — visible only to you`}
          </p>
        </div>
        <div className="flex gap-2">
          {!activeFolder && (
            <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus size={16} className="mr-1" />New Folder
            </Button>
          )}
          <Button className="bg-primary hover:bg-primary/90" onClick={openUpload}>
            <Plus size={16} className="mr-1" />Upload
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={activeFolderName ? `Search in ${activeFolderName}...` : "Search all documents..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Folder grid (landing) */}
      {!activeFolder && !searching && loaded && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {folders.map((f) => (
            <Card key={f.id} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => setActiveFolder(f.id)}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between">
                  <FolderIcon className="w-8 h-8 text-amber-500 fill-amber-100" />
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setRenameFolder({ ...f }); }}>
                      <Pencil size={12} />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f); }}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
                <p className="font-medium text-sm mt-2 truncate">{f.name}</p>
                <p className="text-xs text-muted-foreground">{f.doc_count} document(s)</p>
              </CardContent>
            </Card>
          ))}
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-dashed" onClick={() => setActiveFolder(UNFILED)}>
            <CardContent className="pt-4 pb-4">
              <Inbox className="w-8 h-8 text-muted-foreground" />
              <p className="font-medium text-sm mt-2">Unfiled</p>
              <p className="text-xs text-muted-foreground">{unfiledCount} document(s)</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Document list (inside a folder, or searching) */}
      {(activeFolder || searching) && (
        visibleDocs.length === 0 && loaded ? (
          <Card>
            <CardContent className="pt-8 pb-8 text-center">
              <FolderOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">
                {searching ? "No documents match your search." : "This folder is empty."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {visibleDocs.map((doc) => {
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
                          {searching && (
                            <Badge variant="outline" className="text-[10px] py-0 gap-1">
                              <FolderIcon size={8} />
                              {doc.folder_id ? folderMap.get(doc.folder_id) || "?" : "Unfiled"}
                            </Badge>
                          )}
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
        )
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Private Document</DialogTitle></DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Document title" required className="mt-1" />
            </div>
            <div>
              <Label>Folder</Label>
              <Select value={form.folderId} onValueChange={(v) => setForm({ ...form, folderId: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNFILED}>Unfiled</SelectItem>
                  {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
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

      {/* New Folder Dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Folder</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateFolder} className="space-y-4">
            <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name" autoFocus required />
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90">Create Folder</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={!!renameFolder} onOpenChange={(v) => !v && setRenameFolder(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rename Folder</DialogTitle></DialogHeader>
          {renameFolder && (
            <div className="space-y-4">
              <Input value={renameFolder.name} onChange={(e) => setRenameFolder({ ...renameFolder, name: e.target.value })} autoFocus />
              <Button onClick={handleRenameFolder} className="w-full bg-primary hover:bg-primary/90">Save</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Document Dialog */}
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
                <Label>Folder</Label>
                <Select
                  value={editDoc.folder_id || UNFILED}
                  onValueChange={(v) => setEditDoc({ ...editDoc, folder_id: v === UNFILED ? null : v })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNFILED}>Unfiled</SelectItem>
                    {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
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
