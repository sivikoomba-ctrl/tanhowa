"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText, Download, Upload, Search, FolderLock, Filter, Link, FileUp, X, Eye, Folder, Inbox, ChevronLeft } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const docCategories = [
  "Circular / Order",
  "Minutes of Meeting",
  "Report",
  "Newsletter",
  "Form / Application",
  "Government G.O.s",
  "Legal",
  "Financial",
  "UATT2.0 Association Letters",
  "Others",
];

interface Document {
  id: string;
  title: string;
  description: string;
  file_url: string;
  file_type: string;
  category: string;
  approved: boolean;
  summary?: string;
  folder_id: string | null;
  created_at: string;
  users?: { name: string };
}

interface Folder {
  id: string;
  name: string;
  description: string;
  doc_count: number;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = landing; "all"; "unfiled"; or folder id
  const [form, setForm] = useState({ title: "", description: "", file_url: "", file_type: "", category: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [uploadMode, setUploadMode] = useState<"file" | "url">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const t = useT();

  function load() {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((d) => setDocuments(d.documents || []))
      .catch(() => toast.error("Failed to load documents"));
    fetch("/api/document-folders")
      .then((r) => r.json())
      .then((d) => setFolders(d.folders || []))
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      // Folder scope
      if (activeFolder === "unfiled") { if (doc.folder_id) return false; }
      else if (activeFolder && activeFolder !== "all") { if (doc.folder_id !== activeFolder) return false; }
      const matchesSearch =
        !searchQuery ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.users?.name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = filterCategory === "all" || doc.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [documents, searchQuery, filterCategory, activeFolder]);

  const unfiledDocs = useMemo(() => documents.filter((d) => !d.folder_id), [documents]);
  const folderDocCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of documents) if (d.folder_id) m[d.folder_id] = (m[d.folder_id] || 0) + 1;
    return m;
  }, [documents]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    documents.forEach((doc) => {
      const cat = doc.category || "Others";
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [documents]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    let fileUrl = form.file_url;
    let fileType = form.file_type;

    // Upload file to Supabase Storage if file mode
    if (uploadMode === "file" && selectedFile) {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const uploadRes = await fetch("/api/upload/document", { method: "POST", body: formData });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        toast.error(err.error || "File upload failed");
        setLoading(false);
        return;
      }
      const uploadData = await uploadRes.json();
      fileUrl = uploadData.file_url;
      fileType = fileType || uploadData.file_type;
    }

    if (!fileUrl) {
      toast.error("Please select a file or enter a URL");
      setLoading(false);
      return;
    }

    if (!form.title.trim()) {
      toast.error("Document title is required");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title.trim(), description: form.description.trim(), category: form.category, file_url: fileUrl, file_type: fileType }),
    });

    if (res.ok) {
      toast.success("Document submitted for approval");
      setForm({ title: "", description: "", file_url: "", file_type: "", category: "" });
      setSelectedFile(null);
      setDialogOpen(false);
      load();
    } else {
      toast.error("Failed to upload");
    }
    setLoading(false);
  }

  function getPreviewType(doc: Document): "image" | "pdf" | null {
    const ext = (doc.file_type || "").toLowerCase();
    const url = (doc.file_url || "").toLowerCase();
    if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext) || /\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/.test(url)) return "image";
    if (ext === "pdf" || url.endsWith(".pdf") || /\.pdf(\?|$)/.test(url)) return "pdf";
    return null;
  }

  function trackDownload(doc: Document) {
    fetch("/api/contributions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "document_downloaded", description: "Downloaded: " + doc.title }),
    }).catch(() => {});
  }

  function handleView(doc: Document) {
    const type = getPreviewType(doc);
    if (type) {
      setPreviewDoc(doc);
    } else {
      window.open(doc.file_url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="space-y-6">
      {/* Document Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-3">
            <DialogTitle className="pr-8 truncate">{previewDoc?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto px-6 pb-5">
            {previewDoc && getPreviewType(previewDoc) === "image" && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewDoc.file_url}
                  alt={previewDoc.title}
                  className="w-full h-auto rounded-xl"
                />
              </>
            )}
            {previewDoc && getPreviewType(previewDoc) === "pdf" && (
              <iframe
                src={previewDoc.file_url}
                className="w-full rounded-xl border"
                style={{ height: "70vh" }}
                title={previewDoc.title}
              />
            )}
          </div>
          <div className="flex items-center justify-end gap-2 px-6 pb-4">
            <Button variant="outline" size="sm" asChild>
              <a href={previewDoc?.file_url} target="_blank" rel="noopener noreferrer" onClick={() => previewDoc && trackDownload(previewDoc)}>
                <Download size={14} className="mr-1" />
                {t("common.download")}
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FolderLock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("doc.title")}</h1>
            <p className="text-sm text-muted-foreground">{documents.length} approved document{documents.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Upload size={16} className="mr-1" />
              {t("doc.upload")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("doc.upload")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Document name"
                  required
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description of the document"
                  rows={2}
                />
              </div>
              <div>
                <Label>Category *</Label>
                <Select
                  value={form.category}
                  onValueChange={(val) => setForm({ ...form, category: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {docCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Upload mode toggle */}
              <div>
                <Label>Upload Method *</Label>
                <div className="flex gap-2 mt-1">
                  <Button
                    type="button"
                    variant={uploadMode === "file" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setUploadMode("file")}
                  >
                    <FileUp size={14} className="mr-1" />
                    {t("doc.upload_file")}
                  </Button>
                  <Button
                    type="button"
                    variant={uploadMode === "url" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setUploadMode("url")}
                  >
                    <Link size={14} className="mr-1" />
                    {t("doc.or_url")}
                  </Button>
                </div>
              </div>

              {uploadMode === "file" ? (
                <div>
                  <Label>Select File *</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setSelectedFile(f);
                        if (!form.file_type) {
                          const ext = f.name.split(".").pop()?.toLowerCase() || "";
                          setForm((prev) => ({ ...prev, file_type: ext }));
                        }
                      }
                    }}
                  />
                  {selectedFile ? (
                    <div className="flex items-center gap-2 mt-1 p-2.5 rounded-xl border bg-muted/30">
                      <FileText size={16} className="text-primary shrink-0" />
                      <span className="text-sm truncate flex-1">{selectedFile.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      <button type="button" onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                        <X size={14} className="text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full mt-1"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={14} className="mr-1" />
                      Choose file from device
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, PNG, TXT (max 10MB)</p>
                </div>
              ) : (
                <div>
                  <Label>File URL *</Label>
                  <Input
                    value={form.file_url}
                    onChange={(e) => setForm({ ...form, file_url: e.target.value })}
                    placeholder="https://drive.google.com/..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">Upload to Google Drive or any cloud storage and paste the link</p>
                </div>
              )}
              <div>
                <Label>File Type</Label>
                <Input
                  value={form.file_type}
                  onChange={(e) => setForm({ ...form, file_type: e.target.value })}
                  placeholder="pdf, doc, xlsx"
                />
              </div>
              <Button
                type="submit"
                disabled={loading || (uploadMode === "file" && !selectedFile) || (uploadMode === "url" && !form.file_url)}
                className="w-full bg-primary hover:bg-primary/90"
              >
                {loading ? t("doc.uploading") : t("common.submit")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Folder grid landing */}
      {activeFolder === null && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <button onClick={() => setActiveFolder("all")} className="text-left rounded-2xl border p-4 hover:border-primary hover:shadow-sm transition bg-card">
            <FileText className="w-7 h-7 text-primary mb-2" />
            <p className="font-semibold text-sm">{t("doc.all_documents")}</p>
            <p className="text-xs text-muted-foreground">{documents.length} {documents.length !== 1 ? t("doc.docs") : t("doc.doc")}</p>
          </button>
          {folders.map((f) => (
            <button key={f.id} onClick={() => setActiveFolder(f.id)} className="text-left rounded-2xl border p-4 hover:border-primary hover:shadow-sm transition bg-card">
              <Folder className="w-7 h-7 text-primary mb-2" />
              <p className="font-semibold text-sm truncate">{f.name}</p>
              <p className="text-xs text-muted-foreground">{folderDocCount[f.id] || 0} {(folderDocCount[f.id] || 0) !== 1 ? t("doc.docs") : t("doc.doc")}</p>
              {f.description && <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-2">{f.description}</p>}
            </button>
          ))}
          {unfiledDocs.length > 0 && (
            <button onClick={() => setActiveFolder("unfiled")} className="text-left rounded-2xl border border-dashed p-4 hover:border-primary hover:shadow-sm transition bg-card">
              <Inbox className="w-7 h-7 text-muted-foreground mb-2" />
              <p className="font-semibold text-sm">{t("doc.unfiled")}</p>
              <p className="text-xs text-muted-foreground">{unfiledDocs.length} {unfiledDocs.length !== 1 ? t("doc.docs") : t("doc.doc")}</p>
            </button>
          )}
        </div>
      )}

      {activeFolder !== null && (<>
      <button onClick={() => { setActiveFolder(null); setSearchQuery(""); setFilterCategory("all"); }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ChevronLeft size={14} /> {t("doc.all_folders")}
      </button>

      {/* Search & Filter Bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("doc.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("doc.all_categories")} ({documents.length})</SelectItem>
                  {docCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat} ({categoryCounts[cat] || 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Tabs */}
      {documents.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          <button
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterCategory === "all" ? "bg-primary text-white" : "bg-muted hover:bg-muted/80 text-foreground"}`}
            onClick={() => setFilterCategory("all")}
          >
            All ({documents.length})
          </button>
          {docCategories.map((cat) =>
            categoryCounts[cat] ? (
              <button
                key={cat}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${filterCategory === cat ? "bg-primary text-white" : "bg-muted hover:bg-muted/80 text-foreground"}`}
                onClick={() => setFilterCategory(cat)}
              >
                {cat} ({categoryCounts[cat]})
              </button>
            ) : null
          )}
        </div>
      )}

      {/* Documents Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">
            {searchQuery || filterCategory !== "all"
              ? "No documents match your search"
              : "No approved documents yet"}
          </p>
          {(searchQuery || filterCategory !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => { setSearchQuery(""); setFilterCategory("all"); }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((doc) => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-5">
                <div className="flex gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm leading-tight">{doc.title}</h3>
                    {doc.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.description}</p>
                    )}
                    {doc.summary && (
                      <p className="text-xs text-blue-600/80 mt-1 line-clamp-2 italic">AI: {doc.summary}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {doc.category && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {doc.category}
                        </Badge>
                      )}
                      {doc.file_type && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {doc.file_type.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="text-[11px] text-muted-foreground">
                        {doc.users?.name && <span>by {doc.users.name} &middot; </span>}
                        {formatDate(doc.created_at)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleView(doc)}>
                          <Eye size={12} className="mr-1" />
                          {t("common.view")}
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" onClick={() => trackDownload(doc)}>
                            <Download size={12} className="mr-1" />
                            {t("common.download")}
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </>)}
    </div>
  );
}
