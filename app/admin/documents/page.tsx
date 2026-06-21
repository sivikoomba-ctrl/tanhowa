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
import { Plus, Trash2, FileText, Check, X, FileUp, Link, Upload, Users, Globe, UserCheck, History, UsersRound, Folder, FolderPlus, Pencil, ChevronLeft, Inbox, Lock } from "lucide-react";
import { formatDate } from "@/lib/utils";

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

interface Team {
  id: string;
  name: string;
}

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
  assigned_teams: string[];
  folder_id: string | null;
  created_at: string;
  users?: { name: string };
}

interface Folder {
  id: string;
  name: string;
  description: string;
  visibility: string;
  assigned_users: string[];
  assigned_teams: string[];
  doc_count: number;
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
  const [teams, setTeams] = useState<Team[]>([]);
  const [accessTeams, setAccessTeams] = useState<string[]>([]);
  const [tab, setTab] = useState("pending");
  const [form, setForm] = useState({ title: "", description: "", file_url: "", file_type: "", category: "", visibility: "all", folder_id: "" });
  // Folders
  const [folders, setFolders] = useState<Folder[]>([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = landing grid; "all" = all docs; "unfiled"; or a folder id
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderForm, setFolderForm] = useState({ name: "", description: "", visibility: "all" });
  const [folderMembers, setFolderMembers] = useState<string[]>([]);
  const [folderTeams, setFolderTeams] = useState<string[]>([]);
  const [folderSaving, setFolderSaving] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [accessDocId, setAccessDocId] = useState<string | null>(null);
  const [accessVisibility, setAccessVisibility] = useState("all");
  const [accessFolderId, setAccessFolderId] = useState("");
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

  // Load all docs once; tab + folder filtering happens client-side so the
  // folder grid can show accurate counts regardless of the active tab.
  const load = useCallback(() => {
    fetch("/api/documents?status=all")
      .then((r) => r.json())
      .then((d) => setDocuments(d.documents || []))
      .catch(() => toast.error("Failed to load documents"));
  }, []);

  const loadFolders = useCallback(() => {
    fetch("/api/document-folders")
      .then((r) => r.json())
      .then((d) => { setFolders(d.folders || []); setUnfiledCount(d.unfiled_count || 0); })
      .catch(() => {});
  }, []);

  const loadMembers = useCallback(() => {
    fetch("/api/users?status=approved")
      .then((r) => r.json())
      .then((d) => setMembers(d.users || []))
      .catch(() => {});
  }, []);

  const loadTeams = useCallback(() => {
    fetch("/api/teams")
      .then((r) => r.json())
      .then((d) => setTeams((d.teams || []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    loadFolders();
  }, [load, loadFolders]);

  useEffect(() => {
    loadMembers();
    loadTeams();
  }, [loadMembers, loadTeams]);

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

    // When a folder is chosen, access is governed by the folder — skip per-doc visibility checks.
    const inFolder = !!form.folder_id;
    if (!inFolder && form.visibility === "specific" && selectedMembers.length === 0) {
      toast.error("Please select at least one member");
      setLoading(false);
      return;
    }
    if (!inFolder && form.visibility === "team" && selectedTeams.length === 0) {
      toast.error("Please select at least one team");
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
        folder_id: form.folder_id || null,
        // Foldered docs inherit folder access; store visibility "all" and no per-doc rows.
        visibility: inFolder ? "all" : form.visibility,
        assigned_users: !inFolder && form.visibility === "specific" ? selectedMembers : [],
        assigned_teams: !inFolder && form.visibility === "team" ? selectedTeams : [],
      }),
    });

    if (res.ok) {
      toast.success("Document added (auto-approved)");
      setForm({ title: "", description: "", file_url: "", file_type: "", category: "", visibility: "all", folder_id: "" });
      setSelectedMembers([]);
      setSelectedTeams([]);
      setSelectedFile(null);
      setMemberSearch("");
      setDialogOpen(false);
      load();
      loadFolders();
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
      loadFolders();
    }
  }

  async function handleReject(id: string) {
    if (!confirm("Reject and delete this document?")) return;
    const res = await fetch(`/api/documents?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Document rejected and deleted");
      load();
      loadFolders();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this document?")) return;
    const res = await fetch(`/api/documents?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      load();
      loadFolders();
    }
  }

  function openFolderDialog(folder?: Folder) {
    if (folder) {
      setEditingFolder(folder);
      setFolderForm({ name: folder.name, description: folder.description || "", visibility: folder.visibility || "all" });
      setFolderMembers(folder.assigned_users || []);
      setFolderTeams(folder.assigned_teams || []);
    } else {
      setEditingFolder(null);
      setFolderForm({ name: "", description: "", visibility: "all" });
      setFolderMembers([]);
      setFolderTeams([]);
    }
    setMemberSearch("");
    setFolderDialogOpen(true);
  }

  async function saveFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!folderForm.name.trim()) { toast.error("Folder name is required"); return; }
    if (folderForm.visibility === "specific" && folderMembers.length === 0) { toast.error("Select at least one member"); return; }
    if (folderForm.visibility === "team" && folderTeams.length === 0) { toast.error("Select at least one team"); return; }
    setFolderSaving(true);
    const res = await fetch("/api/document-folders", {
      method: editingFolder ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingFolder?.id,
        name: folderForm.name,
        description: folderForm.description,
        visibility: folderForm.visibility,
        assigned_users: folderForm.visibility === "specific" ? folderMembers : [],
        assigned_teams: folderForm.visibility === "team" ? folderTeams : [],
      }),
    });
    if (res.ok) {
      toast.success(editingFolder ? "Folder updated" : "Folder created");
      setFolderDialogOpen(false);
      loadFolders();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Failed to save folder");
    }
    setFolderSaving(false);
  }

  async function deleteFolder(folder: Folder) {
    if (!confirm(`Delete folder "${folder.name}"? Documents inside it will become Unfiled (not deleted).`)) return;
    const res = await fetch(`/api/document-folders?id=${folder.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Folder deleted");
      if (activeFolder === folder.id) setActiveFolder(null);
      loadFolders();
      load();
    } else {
      toast.error("Failed to delete folder");
    }
  }

  function openAccessDialog(doc: Document) {
    setAccessDocId(doc.id);
    setAccessVisibility(doc.visibility || "all");
    setAccessMembers(doc.assigned_users || []);
    setAccessTeams(doc.assigned_teams || []);
    setAccessFolderId(doc.folder_id || "");
    setMemberSearch("");
    setAccessDialogOpen(true);
  }

  async function saveAccess() {
    if (!accessDocId) return;
    const inFolder = !!accessFolderId;
    if (!inFolder && accessVisibility === "specific" && accessMembers.length === 0 && accessTeams.length === 0) {
      toast.error("Select at least one member or team");
      return;
    }

    const res = await fetch("/api/documents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: accessDocId,
        folder_id: accessFolderId || null,
        // Foldered docs inherit folder access.
        visibility: inFolder ? "all" : accessVisibility,
        assigned_users: !inFolder && accessVisibility === "specific" ? accessMembers : [],
        assigned_teams: !inFolder && accessVisibility === "specific" ? accessTeams : [],
      }),
    });

    if (res.ok) {
      toast.success("Access updated");
      setAccessDialogOpen(false);
      load();
      loadFolders();
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

  // ---- Derived view state ----
  const activeFolderObj = activeFolder && activeFolder !== "all" && activeFolder !== "unfiled"
    ? folders.find((f) => f.id === activeFolder) || null
    : null;
  const tabMatches = (d: Document) => (tab === "all" ? true : tab === "pending" ? !d.approved : d.approved);
  const folderMatches = (d: Document) =>
    activeFolder === "unfiled" ? !d.folder_id
    : activeFolder === "all" || activeFolder === null ? true
    : d.folder_id === activeFolder;
  const visibleDocs = documents.filter((d) => tabMatches(d) && folderMatches(d));

  // Pending counts for landing-grid badges
  const pendingByFolder: Record<string, number> = {};
  let pendingUnfiled = 0;
  for (const d of documents) {
    if (d.approved) continue;
    if (d.folder_id) pendingByFolder[d.folder_id] = (pendingByFolder[d.folder_id] || 0) + 1;
    else pendingUnfiled++;
  }
  const totalDocs = documents.length;

  const folderAccessBadge = (f: Folder) =>
    f.visibility === "team" ? `${f.assigned_teams?.length || 0} team${(f.assigned_teams?.length || 0) !== 1 ? "s" : ""}`
    : f.visibility === "specific" ? `${f.assigned_users?.length || 0} member${(f.assigned_users?.length || 0) !== 1 ? "s" : ""}`
    : "All Members";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {activeFolder !== null ? (
            <button onClick={() => setActiveFolder(null)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-0.5">
              <ChevronLeft size={14} /> All folders
            </button>
          ) : null}
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {activeFolderObj ? <><Folder size={20} className="text-primary" />{activeFolderObj.name}</>
              : activeFolder === "unfiled" ? <><Inbox size={20} className="text-muted-foreground" />Unfiled</>
              : activeFolder === "all" ? "All Documents"
              : "Document Vault"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => openFolderDialog()}>
          <FolderPlus size={16} className="mr-1" />
          New Folder
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90" onClick={() => {
              // Pre-select the folder we're currently viewing
              const preset = activeFolder && activeFolder !== "all" && activeFolder !== "unfiled" ? activeFolder : "";
              setForm((prev) => ({ ...prev, folder_id: preset }));
            }}>
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

              {/* Folder */}
              <div>
                <Label>Folder</Label>
                <Select
                  value={form.folder_id || "none"}
                  onValueChange={(val) => setForm({ ...form, folder_id: val === "none" ? "" : val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No folder (Unfiled)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No folder (Unfiled)</SelectItem>
                    {folders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Visibility — only for unfiled docs; foldered docs inherit folder access */}
              {form.folder_id && (
                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
                  <Lock size={14} className="mt-0.5 shrink-0" />
                  <span>Access is controlled by the folder <strong>{folders.find((f) => f.id === form.folder_id)?.name}</strong>. Everyone who can open the folder will see this document.</span>
                </div>
              )}
              {!form.folder_id && (<>
              <div>
                <Label>Who can see this?</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
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
                    onClick={() => { setForm({ ...form, visibility: "specific" }); setSelectedTeams([]); }}
                  >
                    <Users size={14} className="mr-1" />
                    Specific Members
                  </Button>
                  <Button
                    type="button"
                    variant={form.visibility === "team" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => { setForm({ ...form, visibility: "team" }); setSelectedMembers([]); }}
                  >
                    <UsersRound size={14} className="mr-1" />
                    Specific Team
                  </Button>
                </div>
              </div>

              {form.visibility === "team" && (
                <div>
                  <Label>Select Teams ({selectedTeams.length} selected)</Label>
                  <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg divide-y">
                    {teams.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTeams.includes(t.id)}
                          onChange={() => toggleMember(selectedTeams, setSelectedTeams, t.id)}
                          className="rounded"
                        />
                        <UsersRound size={14} className="text-muted-foreground shrink-0" />
                        <span className="font-medium">{t.name}</span>
                      </label>
                    ))}
                    {teams.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">No teams found</p>
                    )}
                  </div>
                </div>
              )}

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
              </>)}

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
      </div>

      {/* Access management dialog */}
      <Dialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Access</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Folder</Label>
              <Select
                value={accessFolderId || "none"}
                onValueChange={(val) => setAccessFolderId(val === "none" ? "" : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No folder (Unfiled)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No folder (Unfiled)</SelectItem>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {accessFolderId ? (
              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
                <Lock size={14} className="mt-0.5 shrink-0" />
                <span>Access is controlled by the folder <strong>{folders.find((f) => f.id === accessFolderId)?.name}</strong>. Everyone who can open the folder will see this document.</span>
              </div>
            ) : (<>
            <div>
              <Label>Who can see this document?</Label>
              <div className="flex gap-2 mt-1 flex-wrap">
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
                  onClick={() => { setAccessVisibility("specific"); setAccessTeams([]); }}
                >
                  <Users size={14} className="mr-1" />
                  Specific Members
                </Button>
                <Button
                  type="button"
                  variant={accessVisibility === "team" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => { setAccessVisibility("team"); setAccessMembers([]); }}
                >
                  <UsersRound size={14} className="mr-1" />
                  Specific Team
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

            {accessVisibility === "team" && (
              <div>
                <Label>Select Teams ({accessTeams.length} selected)</Label>
                <div className="mt-2 max-h-52 overflow-y-auto border rounded-lg divide-y">
                  {teams.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={accessTeams.includes(t.id)}
                        onChange={() => toggleMember(accessTeams, setAccessTeams, t.id)}
                        className="rounded"
                      />
                      <UsersRound size={14} className="text-muted-foreground shrink-0" />
                      <span className="font-medium">{t.name}</span>
                    </label>
                  ))}
                  {teams.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">No teams found</p>
                  )}
                </div>
              </div>
            )}
            </>)}

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

      {/* Folder create / edit dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFolder ? "Edit Folder" : "New Folder"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveFolder} className="space-y-4">
            <div>
              <Label>Folder Name *</Label>
              <Input value={folderForm.name} onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })} placeholder="e.g. Legal Documents" required />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={folderForm.description} onChange={(e) => setFolderForm({ ...folderForm, description: e.target.value })} placeholder="What's kept in this folder" rows={2} />
            </div>
            <div>
              <Label>Who can open this folder?</Label>
              <div className="flex gap-2 mt-1 flex-wrap">
                <Button type="button" variant={folderForm.visibility === "all" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setFolderForm({ ...folderForm, visibility: "all" })}>
                  <Globe size={14} className="mr-1" />All Members
                </Button>
                <Button type="button" variant={folderForm.visibility === "specific" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => { setFolderForm({ ...folderForm, visibility: "specific" }); setFolderTeams([]); }}>
                  <Users size={14} className="mr-1" />Specific Members
                </Button>
                <Button type="button" variant={folderForm.visibility === "team" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => { setFolderForm({ ...folderForm, visibility: "team" }); setFolderMembers([]); }}>
                  <UsersRound size={14} className="mr-1" />Specific Team
                </Button>
              </div>
            </div>
            {folderForm.visibility === "team" && (
              <div>
                <Label>Select Teams ({folderTeams.length} selected)</Label>
                <div className="mt-2 max-h-44 overflow-y-auto border rounded-lg divide-y">
                  {teams.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm">
                      <input type="checkbox" checked={folderTeams.includes(t.id)} onChange={() => toggleMember(folderTeams, setFolderTeams, t.id)} className="rounded" />
                      <UsersRound size={14} className="text-muted-foreground shrink-0" />
                      <span className="font-medium">{t.name}</span>
                    </label>
                  ))}
                  {teams.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No teams found</p>}
                </div>
              </div>
            )}
            {folderForm.visibility === "specific" && (
              <div>
                <Label>Select Members ({folderMembers.length} selected)</Label>
                <Input placeholder="Search members..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} className="mt-1" />
                <div className="mt-2 max-h-44 overflow-y-auto border rounded-lg divide-y">
                  {filteredMembers.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm">
                      <input type="checkbox" checked={folderMembers.includes(m.id)} onChange={() => toggleMember(folderMembers, setFolderMembers, m.id)} className="rounded" />
                      <span className="font-medium uppercase">{m.name || "Unnamed"}</span>
                      <span className="text-muted-foreground text-xs">{m.email}</span>
                    </label>
                  ))}
                  {filteredMembers.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No members found</p>}
                </div>
              </div>
            )}
            <Button type="submit" disabled={folderSaving} className="w-full bg-primary hover:bg-primary/90">
              {folderSaving ? "Saving..." : editingFolder ? "Save Folder" : "Create Folder"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {activeFolder === null ? (
        /* ---- Folder grid landing ---- */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <button onClick={() => setActiveFolder("all")} className="text-left rounded-2xl border p-4 hover:border-primary hover:shadow-sm transition bg-card">
            <FileText className="w-7 h-7 text-primary mb-2" />
            <p className="font-semibold text-sm">All Documents</p>
            <p className="text-xs text-muted-foreground">{totalDocs} total</p>
          </button>
          {folders.map((f) => (
            <div key={f.id} className="relative rounded-2xl border p-4 hover:border-primary hover:shadow-sm transition bg-card group">
              <button onClick={() => setActiveFolder(f.id)} className="text-left w-full">
                <Folder className="w-7 h-7 text-primary mb-2" />
                <p className="font-semibold text-sm truncate">{f.name}</p>
                <p className="text-xs text-muted-foreground">{f.doc_count} doc{f.doc_count !== 1 ? "s" : ""}</p>
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">
                    {f.visibility === "all" ? <Globe size={9} className="mr-0.5" /> : f.visibility === "team" ? <UsersRound size={9} className="mr-0.5" /> : <UserCheck size={9} className="mr-0.5" />}
                    {folderAccessBadge(f)}
                  </Badge>
                  {pendingByFolder[f.id] ? <Badge className="text-[10px] bg-amber-500">{pendingByFolder[f.id]} pending</Badge> : null}
                </div>
              </button>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <button onClick={() => openFolderDialog(f)} className="p-1 rounded hover:bg-muted" title="Edit folder"><Pencil size={13} className="text-muted-foreground" /></button>
                <button onClick={() => deleteFolder(f)} className="p-1 rounded hover:bg-muted" title="Delete folder"><Trash2 size={13} className="text-destructive" /></button>
              </div>
            </div>
          ))}
          <button onClick={() => setActiveFolder("unfiled")} className="text-left rounded-2xl border border-dashed p-4 hover:border-primary hover:shadow-sm transition bg-card">
            <Inbox className="w-7 h-7 text-muted-foreground mb-2" />
            <p className="font-semibold text-sm">Unfiled</p>
            <p className="text-xs text-muted-foreground">{unfiledCount} doc{unfiledCount !== 1 ? "s" : ""}</p>
            {pendingUnfiled ? <Badge className="text-[10px] bg-amber-500 mt-1.5">{pendingUnfiled} pending</Badge> : null}
          </button>
        </div>
      ) : (
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending Approval</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {visibleDocs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No {tab} documents</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleDocs.map((doc) => (
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
                            {/* Folder / visibility badge — foldered docs inherit folder access */}
                            {doc.folder_id ? (
                              <Badge variant="secondary" className="text-xs">
                                <Folder size={10} className="mr-1" />
                                {folders.find((f) => f.id === doc.folder_id)?.name || "Folder"}
                              </Badge>
                            ) : doc.visibility === "specific" ? (
                              <Badge variant="secondary" className="text-xs">
                                <UserCheck size={10} className="mr-1" />
                                {doc.assigned_users?.length || 0} member{(doc.assigned_users?.length || 0) !== 1 ? "s" : ""}
                              </Badge>
                            ) : doc.visibility === "team" ? (
                              <Badge variant="secondary" className="text-xs">
                                <UsersRound size={10} className="mr-1" />
                                {(doc.assigned_teams || []).map((tid) => teams.find((t) => t.id === tid)?.name || "Team").join(", ") || "Team"}
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
      )}
    </div>
  );
}
