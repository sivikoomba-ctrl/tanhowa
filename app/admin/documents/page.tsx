"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { Plus, Trash2, FileText, Check, X, FileUp, Link, Upload, Users, Globe, UserCheck, History } from "lucide-react";
import { formatDate } from "@/lib/utils";

const docCategories = [
  "Circular / Order",
  "Minutes of Meeting",
  "Report",
  "Newsletter",
  "Form / Application",
  "Government G.O.s",
  "Legal",
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
  visibility: string;
  assigned_users: string[];
  created_at: string;
  users?: { name: string };
}

interface DocVersion {
  id: string;
  version_num: number;
  file_url: string;
  title: string;
  description: string;
  change_summary: string;
  created_at: string;
  users?: { name: string };
}

interface Member {
  id: string;
  name: string;
  email: string;
}

export default function AdminDocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tab, setTab] = useState("pending");
  const [form, setForm] = useState({ title: "", description: "", file_url: "", file_type: "", category: "", visibility: "all" });
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [accessDocId, setAccessDocId] = useState<string | null>(null);
  const [accessVisibility, setAccessVisibility] = useState("all");
  const [accessMembers, setAccessMembers] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadMode, setUploadMode] = useState<"file" | "url">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [, setHistoryDocId] = useState<string | null>(null);
  const [historyDocTitle, setHistoryDocTitle] = useState("");
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const load = useCallback(() => {
    fetch("/api/documents?status=" + tab)
      .then((r) => r.json())
      .then((d) => setDocuments(d.documents || []))
      .catch(() => toast.error("Failed to load documents"));
  }, [tab]);

  const loadMembers = useCallback(() => {
    fetch("/api/users?status=approved")
      .then((r) => r.json())
      .then((d) => setMembers(d.users || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const filteredMembers = members.filter((m) => {
    if (!memberSearch) return true;
    const q = memberSearch.toLowerCase();
    return m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q);
  });

  function toggleMember(list: string[], setList: (v: string[]) => void, userId: string) {
    if (list.includes(userId)) {
      setList(list.filter((id) => id !== userId));
    } else {
      setList([...list, userId]);
    }
  }

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

    if (form.visibility === "specific" && selectedMembers.length === 0) {
      toast.error("Please select at least one member");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        file_url: fileUrl,
        file_type: fileType,
        assigned_users: form.visibility === "specific" ? selectedMembers : [],
      }),
    });

    if (res.ok) {
      toast.success("Document added (auto-approved)");
      setForm({ title: "", description: "", file_url: "", file_type: "", category: "", visibility: "all" });
      setSelectedMembers([]);
      setSelectedFile(null);
      setMemberSearch("");
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

  function openAccessDialog(doc: Document) {
    setAccessDocId(doc.id);
    setAccessVisibility(doc.visibility || "all");
    setAccessMembers(doc.assigned_users || []);
    setMemberSearch("");
    setAccessDialogOpen(true);
  }

  async function saveAccess() {
    if (!accessDocId) return;
    if (accessVisibility === "specific" && accessMembers.length === 0) {
      toast.error("Please select at least one member");
      return;
    }

    const res = await fetch("/api/documents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: accessDocId,
        visibility: accessVisibility,
        assigned_users: accessVisibility === "specific" ? accessMembers : [],
      }),
    });

    if (res.ok) {
      toast.success("Access updated");
      setAccessDialogOpen(false);
      load();
    } else {
      toast.error("Failed to update access");
    }
  }

  function openHistory(doc: Document) {
    setHistoryDocId(doc.id);
    setHistoryDocTitle(doc.title);
    setHistoryDialogOpen(true);
    setLoadingVersions(true);
    fetch(`/api/documents?versions=${doc.id}`)
      .then((r) => r.json())
      .then((d) => setVersions(d.versions || []))
      .catch(() => toast.error("Failed to load version history"))
      .finally(() => setLoadingVersions(false));
  }

  function getMemberName(userId: string) {
    const m = members.find((m) => m.id === userId);
    return m?.name || m?.email || userId.slice(0, 8);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Document Vault</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-1" />
              Add Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
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

              {/* Visibility */}
              <div>
                <Label>Who can see this?</Label>
                <div className="flex gap-2 mt-1">
                  <Button
                    type="button"
                    variant={form.visibility === "all" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setForm({ ...form, visibility: "all" })}
                  >
                    <Globe size={14} className="mr-1" />
                    All Members
                  </Button>
                  <Button
                    type="button"
                    variant={form.visibility === "specific" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setForm({ ...form, visibility: "specific" })}
                  >
                    <Users size={14} className="mr-1" />
                    Specific Members
                  </Button>
                </div>
              </div>

              {form.visibility === "specific" && (
                <div>
                  <Label>Select Members ({selectedMembers.length} selected)</Label>
                  <Input
                    placeholder="Search members..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="mt-1"
                  />
                  <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg divide-y">
                    {filteredMembers.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(m.id)}
                          onChange={() => toggleMember(selectedMembers, setSelectedMembers, m.id)}
                          className="rounded"
                        />
                        <span className="font-medium uppercase">{m.name || "Unnamed"}</span>
                        <span className="text-muted-foreground text-xs">{m.email}</span>
                      </label>
                    ))}
                    {filteredMembers.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">No members found</p>
                    )}
                  </div>
                </div>
              )}

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

      {/* Access management dialog */}
      <Dialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Access</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Who can see this document?</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  variant={accessVisibility === "all" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setAccessVisibility("all")}
                >
                  <Globe size={14} className="mr-1" />
                  All Members
                </Button>
                <Button
                  type="button"
                  variant={accessVisibility === "specific" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setAccessVisibility("specific")}
                >
                  <Users size={14} className="mr-1" />
                  Specific Members
                </Button>
              </div>
            </div>

            {accessVisibility === "specific" && (
              <div>
                <Label>Select Members ({accessMembers.length} selected)</Label>
                <Input
                  placeholder="Search members..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="mt-1"
                />
                <div className="mt-2 max-h-52 overflow-y-auto border rounded-lg divide-y">
                  {filteredMembers.map((m) => (
                    <label
                      key={m.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={accessMembers.includes(m.id)}
                        onChange={() => toggleMember(accessMembers, setAccessMembers, m.id)}
                        className="rounded"
                      />
                      <span className="font-medium uppercase">{m.name || "Unnamed"}</span>
                      <span className="text-muted-foreground text-xs">{m.email}</span>
                    </label>
                  ))}
                  {filteredMembers.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">No members found</p>
                  )}
                </div>
              </div>
            )}

            <Button onClick={saveAccess} className="w-full bg-primary hover:bg-primary/90">
              Save Access
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Version History: {historyDocTitle}</DialogTitle>
          </DialogHeader>
          {loadingVersions ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading versions...</div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No previous versions found</div>
          ) : (
            <div className="space-y-3">
              {versions.map((v) => (
                <Card key={v.id}>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">v{v.version_num}</Badge>
                          <span className="text-sm font-medium">{v.title || "Untitled"}</span>
                        </div>
                        {v.change_summary && (
                          <p className="text-xs text-muted-foreground mt-1">{v.change_summary}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          {v.users?.name && <span className="uppercase">by {v.users.name}</span>}
                          <span>{formatDate(v.created_at)}</span>
                        </div>
                      </div>
                      <a href={v.file_url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="text-xs">
                          <FileText size={12} className="mr-1" /> View
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                            {/* Visibility badge */}
                            {doc.visibility === "specific" ? (
                              <Badge variant="secondary" className="text-xs">
                                <UserCheck size={10} className="mr-1" />
                                {doc.assigned_users?.length || 0} member{(doc.assigned_users?.length || 0) !== 1 ? "s" : ""}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                <Globe size={10} className="mr-1" />
                                All Members
                              </Badge>
                            )}
                            {doc.users?.name && <span className="text-xs text-muted-foreground uppercase">by {doc.users.name}</span>}
                            <span className="text-xs text-muted-foreground">
                              {formatDate(doc.created_at)}
                            </span>
                          </div>
                          {/* Show assigned member names for specific docs */}
                          {doc.visibility === "specific" && doc.assigned_users?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {doc.assigned_users.slice(0, 5).map((uid) => (
                                <span key={uid} className="text-[10px] bg-muted px-1.5 py-0.5 rounded uppercase">
                                  {getMemberName(uid)}
                                </span>
                              ))}
                              {doc.assigned_users.length > 5 && (
                                <button
                                  className="text-[10px] text-primary hover:underline"
                                  onClick={() => toast.info(doc.assigned_users.map((uid: string) => getMemberName(uid)).join(", "), { duration: 10000 })}
                                >+{doc.assigned_users.length - 5} more — view all</button>
                              )}
                            </div>
                          )}
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">
                            View file
                          </a>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.approved && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openHistory(doc)}>
                              <History size={14} className="mr-1" />
                              History
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openAccessDialog(doc)}>
                              <Users size={14} className="mr-1" />
                              Access
                            </Button>
                          </>
                        )}
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
