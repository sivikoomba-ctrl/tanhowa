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
import { FileText, Download, Upload, Search, FolderLock, Filter } from "lucide-react";
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

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [form, setForm] = useState({ title: "", description: "", file_url: "", file_type: "", category: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  function load() {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((d) => setDocuments(d.documents || []))
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch =
        !searchQuery ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.users?.name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = filterCategory === "all" || doc.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [documents, searchQuery, filterCategory]);

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

    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      toast.success("Document submitted for approval");
      setForm({ title: "", description: "", file_url: "", file_type: "", category: "" });
      setDialogOpen(false);
      load();
    } else {
      toast.error("Failed to upload");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FolderLock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Document Vault</h1>
            <p className="text-sm text-muted-foreground">{documents.length} approved document{documents.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Upload size={16} className="mr-1" />
              Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
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
              <div>
                <Label>File URL *</Label>
                <Input
                  value={form.file_url}
                  onChange={(e) => setForm({ ...form, file_url: e.target.value })}
                  placeholder="https://drive.google.com/..."
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Upload to Google Drive or any cloud storage and paste the link</p>
              </div>
              <div>
                <Label>File Type</Label>
                <Input
                  value={form.file_type}
                  onChange={(e) => setForm({ ...form, file_type: e.target.value })}
                  placeholder="pdf, doc, xlsx"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
                {loading ? "Uploading..." : "Submit for Approval"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search & Filter Bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, description, or uploader..."
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
                  <SelectItem value="all">All Categories ({documents.length})</SelectItem>
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

      {/* Category Summary Tags */}
      {documents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={filterCategory === "all" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setFilterCategory("all")}
          >
            All ({documents.length})
          </Badge>
          {docCategories.map((cat) =>
            categoryCounts[cat] ? (
              <Badge
                key={cat}
                variant={filterCategory === cat ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setFilterCategory(cat)}
              >
                {cat} ({categoryCounts[cat]})
              </Badge>
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
                      <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                          <Download size={12} className="mr-1" />
                          Download
                        </a>
                      </Button>
                    </div>
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
