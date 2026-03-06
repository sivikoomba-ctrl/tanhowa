"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, FileText, Check, X, FileUp, Link, Upload } from "lucide-react";
import { formatDate } from "@/lib/utils";

const docCategories = [
  "Circular / Order",
  "Minutes of Meeting",
  "Report",
  "Newsletter",
  "Form / Application",
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
  created_at: string;
  users?: { name: string };
}

export default function AdminDocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tab, setTab] = useState("pending");
  const [form, setForm] = useState({ title: "", description: "", file_url: "", file_type: "", category: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadMode, setUploadMode] = useState<"file" | "url">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    fetch("/api/documents?status=" + tab)
      .then((r) => r.json())
      .then((d) => setDocuments(d.documents || []))
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, [tab]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    let fileUrl = form.file_url;
    let fileType = form.file_type;

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

    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, file_url: fileUrl, file_type: fileType }),
    });

    if (res.ok) {
      toast.success("Document added (auto-approved)");
      setForm({ title: "", description: "", file_url: "", file_type: "", category: "" });
      setSelectedFile(null);
      setDialogOpen(false);
      load();
    } else {
      toast.error("Failed to add");
    }
    setLoading(false);
  }

  async function handleApprove(id: string) {
    const res = await fetch("/api/documents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, approved: true }),
    });
    if (res.ok) {
      toast.success("Document approved");
      load();
    }
  }

  async function handleReject(id: string) {
    if (!confirm("Reject and delete this document?")) return;
    const res = await fetch(`/api/documents?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Document rejected and deleted");
      load();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this document?")) return;
    const res = await fetch(`/api/documents?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Documents</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-1" />
              Add Document
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Document</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
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
                  placeholder="Brief description"
                  rows={2}
                />
              </div>
              <div>
                <Label>Category</Label>
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
                    Upload File
                  </Button>
                  <Button
                    type="button"
                    variant={uploadMode === "url" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setUploadMode("url")}
                  >
                    <Link size={14} className="mr-1" />
                    Paste URL
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
                    placeholder="https://..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">Paste link from Google Drive or any cloud storage</p>
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
                {loading ? "Uploading..." : "Add Document"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending Approval</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {documents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No {tab} documents</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="pt-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-sm">{doc.title}</h3>
                            <Badge variant={doc.approved ? "default" : "secondary"} className="text-xs">
                              {doc.approved ? "Approved" : "Pending"}
                            </Badge>
                          </div>
                          {doc.description && <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>}
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {doc.category && <Badge variant="outline" className="text-xs">{doc.category}</Badge>}
                            {doc.file_type && <Badge variant="outline" className="text-xs">{doc.file_type.toUpperCase()}</Badge>}
                            {doc.users?.name && <span className="text-xs text-muted-foreground uppercase">by {doc.users.name}</span>}
                            <span className="text-xs text-muted-foreground">
                              {formatDate(doc.created_at)}
                            </span>
                          </div>
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">
                            View file
                          </a>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!doc.approved && (
                          <Button size="sm" onClick={() => handleApprove(doc.id)} className="bg-primary hover:bg-primary/90">
                            <Check size={14} className="mr-1" />
                            Approve
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={!doc.approved ? "destructive" : "ghost"}
                          onClick={() => (!doc.approved ? handleReject(doc.id) : handleDelete(doc.id))}
                          className={doc.approved ? "text-destructive" : ""}
                        >
                          {!doc.approved ? <><X size={14} className="mr-1" />Reject</> : <Trash2 size={14} />}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
