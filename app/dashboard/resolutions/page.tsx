"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Vote, Plus, ThumbsUp, Check, X, Send, FileText, Download, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useT, useLang } from "@/lib/i18n";

const BRAND_GREEN: [number, number, number] = [45, 106, 79];
const PRESIDENT_SIGNATURE_URL = "https://ztracifmvkrjfoslkzpl.supabase.co/storage/v1/object/public/avatars/president-signature.png";

async function downloadResolutionPdf(r: Resolution) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  // Fetch voter details
  const votersRes = await fetch(`/api/resolutions?voters_for=${r.id}`);
  const votersData = await votersRes.json();
  const voters: { user: { name: string; occupation?: string; posting_details?: { regular_district?: string } }; created_at: string }[] = votersData.voters || [];

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = 15;

  // Header: TANHOWA letterhead
  doc.setFillColor(...BRAND_GREEN);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("TAMIL NADU HORTICULTURAL OFFICERS WELFARE ASSOCIATION", pageW / 2, 11, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("(TANHOWA) | Registered Society | www.tanhowa.in", pageW / 2, 18, { align: "center" });
  doc.text("Regd. Office: Chennai, Tamil Nadu, India", pageW / 2, 23, { align: "center" });

  y = 36;

  // Title: RESOLUTION
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("RESOLUTION", pageW / 2, y, { align: "center" });
  y += 3;

  // Underline
  doc.setDrawColor(...BRAND_GREEN);
  doc.setLineWidth(0.8);
  doc.line(margin + 40, y, pageW - margin - 40, y);
  y += 8;

  // Status badge
  const passed = r.status === "passed";
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...(passed ? [0, 128, 0] as [number, number, number] : [200, 0, 0] as [number, number, number]));
  doc.text(passed ? "STATUS: PASSED" : "STATUS: FAILED", pageW / 2, y, { align: "center" });
  y += 8;

  // Resolution details table
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const details = [
    ["Resolution Title", r.title],
    ["Category", r.category || "General"],
    ["Proposed By", r.submitter?.name || "—"],
    ["Total Members", String(r.total_members)],
    ["Votes Required (Quorum)", String(r.votes_required)],
    ["Votes Received", String(r.vote_count)],
    ["Voting Opened", r.voting_opened_at ? new Date(r.voting_opened_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "—"],
    ["Voting Closed", r.voting_closed_at ? new Date(r.voting_closed_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "—"],
    ["Result", passed ? "PASSED (Majority achieved)" : "FAILED (Majority not achieved)"],
  ];

  autoTable(doc, {
    startY: y,
    head: [],
    body: details,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50, fillColor: [245, 245, 245] },
      1: { cellWidth: contentW - 50 },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Description
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("RESOLUTION TEXT:", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const descLines = doc.splitTextToSize(r.description, contentW);
  doc.text(descLines, margin, y);
  y += descLines.length * 4.5 + 6;

  // Voter list
  if (voters.length > 0) {
    // Check page space
    if (y > 200) { doc.addPage(); y = 20; }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("LIST OF MEMBERS WHO VOTED IN FAVOUR:", margin, y);
    y += 5;

    const voterRows = voters.map((v, i) => [
      String(i + 1),
      (v.user?.name || "—").toUpperCase(),
      v.user?.occupation || "—",
      v.user?.posting_details?.regular_district || "—",
      new Date(v.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    ]);

    autoTable(doc, {
      startY: y,
      head: [["S.No", "Member Name", "Designation", "District", "Voted On"]],
      body: voterRows,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 50 },
        4: { cellWidth: 25 },
      },
      margin: { left: margin, right: margin },
    });

    y = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // Check page space for signature
  if (y > 230) { doc.addPage(); y = 20; }

  // Declaration
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  const declaration = "This is to certify that the above resolution was duly proposed, seconded, and put to vote in accordance with the rules and bye-laws of the Tamil Nadu Horticultural Officers Welfare Association (TANHOWA). The voting was conducted in a fair and transparent manner through the official TANHOWA digital portal (www.tanhowa.in). Each vote was uniquely captured with the member's identity and timestamp.";
  const declLines = doc.splitTextToSize(declaration, contentW);
  doc.text(declLines, margin, y);
  y += declLines.length * 4 + 10;

  // Signature block
  // Try to load president's signature image
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = PRESIDENT_SIGNATURE_URL;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(img, 0, 0);
    const imgData = canvas.toDataURL("image/png");
    doc.addImage(imgData, "PNG", pageW - margin - 50, y - 5, 40, 20);
  } catch {
    // No signature image — skip
  }

  y += 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("_______________________________", pageW - margin - 55, y);
  y += 5;
  doc.text("President", pageW - margin - 45, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Tamil Nadu Horticultural Officers", pageW - margin - 55, y);
  y += 4;
  doc.text("Welfare Association (TANHOWA)", pageW - margin - 55, y);
  y += 6;

  // Date
  const now = new Date();
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Date: ${now.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`, margin, y);
  doc.text(`Time: ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`, margin + 70, y);
  y += 4;
  doc.text("Place: Chennai, Tamil Nadu", margin, y);

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, doc.internal.pageSize.getHeight() - 10, pageW, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.text("TANHOWA — Tamil Nadu Horticultural Officers Welfare Association | www.tanhowa.in", pageW / 2, doc.internal.pageSize.getHeight() - 4, { align: "center" });
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, doc.internal.pageSize.getHeight() - 4, { align: "right" });
  }

  const safeName = r.title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
  doc.save(`TANHOWA_Resolution_${safeName}.pdf`);
}

interface Resolution {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  submitted_by: string;
  vote_count: number;
  votes_required: number;
  total_members: number;
  user_voted: boolean;
  admin_remarks: string;
  voting_opened_at: string | null;
  voting_closed_at: string | null;
  created_at: string;
  submitter?: { name: string };
  approver?: { name: string };
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-700", icon: FileText },
  submitted: { label: "Submitted", color: "bg-amber-100 text-amber-800", icon: Send },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-800", icon: Check },
  voting_open: { label: "Voting Open", color: "bg-purple-100 text-purple-800", icon: Vote },
  passed: { label: "Passed", color: "bg-green-100 text-green-800", icon: Check },
  failed: { label: "Failed", color: "bg-red-100 text-red-800", icon: X },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800", icon: X },
};

export default function ResolutionsPage() {
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [myResolutions, setMyResolutions] = useState<Resolution[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [tab, setTab] = useState("voting");
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [creating, setCreating] = useState(false);
  const [votingIds, setVotingIds] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState("all");
  const t = useT();
  const { lang } = useLang();

  function loadResolutions() {
    fetch(`/api/resolutions${lang === "ta" ? "?lang=ta" : ""}`)
      .then((r) => r.json())
      .then((d) => setResolutions(d.resolutions || []))
      .catch(() => toast.error("Failed to load resolutions"));
  }

  function loadMyResolutions() {
    fetch("/api/resolutions?my=true")
      .then((r) => r.json())
      .then((d) => setMyResolutions(d.resolutions || []))
      .catch(() => {});
  }

  useEffect(() => {
    loadResolutions();
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          const r = d.user.role;
          const o = d.user.official_type;
          // Only super_admin and state officials can create resolutions
          if (r === "super_admin" || o === "state") {
            setCanCreate(true);
            loadMyResolutions();
          }
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const categories = useMemo(() => Array.from(new Set(resolutions.map((r) => r.category).filter(Boolean))).sort(), [resolutions]);
  const filterByCategory = useCallback((list: Resolution[]) => categoryFilter === "all" ? list : list.filter((r) => r.category === categoryFilter), [categoryFilter]);
  const votingOpen = useMemo(() => filterByCategory(resolutions.filter((r) => r.status === "voting_open")), [resolutions, filterByCategory]);
  const results = useMemo(() => filterByCategory(resolutions.filter((r) => r.status === "passed" || r.status === "failed")), [resolutions, filterByCategory]);
  const drafts = useMemo(() => myResolutions.filter((r) => r.status === "draft" || r.status === "submitted" || r.status === "approved" || r.status === "rejected"), [myResolutions]);

  async function handleCreate() {
    if (!title.trim() || !description.trim()) { toast.error("Title and description are required"); return; }
    setCreating(true);
    const res = await fetch("/api/resolutions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: description.trim(), category: category.trim() }),
    });
    setCreating(false);
    if (res.ok) {
      toast.success("Resolution created as draft");
      setShowCreate(false);
      setTitle(""); setDescription(""); setCategory("");
      loadMyResolutions();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to create");
    }
  }

  async function handleSubmit(resolutionId: string) {
    const res = await fetch("/api/resolutions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolutionId, action: "submit" }),
    });
    if (res.ok) {
      toast.success("Resolution submitted for approval");
      loadMyResolutions();
    } else {
      toast.error("Failed to submit");
    }
  }

  async function handleVote(resolutionId: string, voted: boolean) {
    setVotingIds((prev) => new Set(prev).add(resolutionId));
    const res = await fetch("/api/resolutions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolutionId, action: voted ? "unvote" : "vote" }),
    });
    setVotingIds((prev) => { const s = new Set(prev); s.delete(resolutionId); return s; });
    if (res.ok) {
      toast.success(voted ? "Vote withdrawn" : "Vote cast!");
      loadResolutions();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to vote");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("resolution.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("resolution.voting")}</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90">
            <Plus size={16} className="mr-1" />{t("resolution.new_resolution")}
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="voting" className="gap-1.5">
            <Vote size={14} />{t("resolution.voting")} ({votingOpen.length})
          </TabsTrigger>
          <TabsTrigger value="results" className="gap-1.5">
            <Check size={14} />{t("resolution.results")} ({results.length})
          </TabsTrigger>
          {canCreate && (
            <TabsTrigger value="my" className="gap-1.5">
              <FileText size={14} />{t("resolution.my_drafts")} ({drafts.length})
            </TabsTrigger>
          )}
        </TabsList>

        {categories.length > 0 && (
          <div className="mt-3">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder={t("resolution.all_categories")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("resolution.all_categories")}</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Voting Open */}
        <TabsContent value="voting" className="mt-4">
          {votingOpen.length === 0 ? (
            <div className="text-center py-12">
              <Vote className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">{t("resolution.no_voting")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {votingOpen.map((r) => (
                <VotingCard key={r.id} resolution={r} onVote={handleVote} voting={votingIds.has(r.id)} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Results */}
        <TabsContent value="results" className="mt-4">
          {results.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">{t("resolution.no_results")}</p>
          ) : (
            <div className="space-y-4">
              {results.map((r) => (
                <ResultCard key={r.id} resolution={r} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* My Resolutions */}
        {canCreate && (
          <TabsContent value="my" className="mt-4">
            {drafts.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">{t("resolution.no_drafts")}</p>
            ) : (
              <div className="space-y-4">
                {drafts.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{r.title}</h3>
                            <StatusBadge status={r.status} />
                          </div>
                          {r.category && <Badge variant="outline" className="text-xs mb-2">{r.category}</Badge>}
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.description}</p>
                          {r.admin_remarks && (
                            <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                              <b>Admin remarks:</b> {r.admin_remarks}
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">Created {formatDate(r.created_at)}</p>
                        </div>
                        {r.status === "draft" && (
                          <Button size="sm" onClick={() => handleSubmit(r.id)} className="bg-primary hover:bg-primary/90">
                            <Send size={14} className="mr-1" />Submit
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("resolution.new_resolution")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Resolution Title *" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Category (optional, e.g. Financial, Welfare, Administrative)" value={category} onChange={(e) => setCategory(e.target.value)} />
            <Textarea
              placeholder="Resolution description / agenda *&#10;&#10;Describe the resolution in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              The resolution will be saved as a draft. Submit it when ready for admin approval.
            </p>
            <Button onClick={handleCreate} disabled={creating} className="w-full bg-primary hover:bg-primary/90">
              {creating ? t("resolution.creating") : t("resolution.create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, color: "bg-gray-100 text-gray-700", icon: FileText };
  return (
    <Badge className={`text-xs ${config.color}`}>
      {config.label}
    </Badge>
  );
}

function VotingCard({ resolution: r, onVote, voting }: { resolution: Resolution; onVote: (id: string, voted: boolean) => void; voting: boolean }) {
  const percentage = r.votes_required > 0 ? Math.min(100, Math.round((r.vote_count / r.votes_required) * 100)) : 0;

  return (
    <Card className="border-l-4 border-l-purple-500">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold">{r.title}</h3>
              {r.category && <Badge variant="outline" className="text-xs">{r.category}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.description}</p>
            {r.submitter?.name && (
              <p className="text-sm mt-1 mb-3">
                <span className="text-muted-foreground">Proposed by: </span>
                <span className="font-semibold">{r.submitter.name}</span>
              </p>
            )}

            {/* Vote Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-purple-700">
                  {r.vote_count} / {r.votes_required} votes needed to pass
                </span>
                <span className="text-muted-foreground">{percentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${percentage >= 100 ? "bg-green-500" : "bg-purple-500"}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Total members: {r.total_members} <span className="italic">(as of opening)</span> &middot; Majority required: {r.votes_required}
                {r.voting_opened_at && <> &middot; Opened {formatDate(r.voting_opened_at)}</>}
              </p>
            </div>
          </div>

          <div className="shrink-0">
            {r.user_voted ? (
              <div className="flex flex-col items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onVote(r.id, true)}
                  disabled={voting}
                  className="text-green-700 border-green-300 hover:bg-green-50"
                >
                  <ThumbsUp size={16} className="mr-1 fill-green-600" />
                  Voted
                </Button>
                <button
                  onClick={() => onVote(r.id, true)}
                  disabled={voting}
                  className="text-xs text-muted-foreground hover:text-red-600 transition-colors"
                >
                  Withdraw
                </button>
              </div>
            ) : (
              <Button
                onClick={() => onVote(r.id, false)}
                disabled={voting}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <ThumbsUp size={16} className="mr-1" />
                Vote YES
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultCard({ resolution: r }: { resolution: Resolution }) {
  const passed = r.status === "passed";
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadResolutionPdf(r);
    } catch {
      toast.error("Failed to generate PDF");
    }
    setDownloading(false);
  }

  return (
    <Card className={`border-l-4 ${passed ? "border-l-green-500" : "border-l-red-400"}`}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold">{r.title}</h3>
              <StatusBadge status={r.status} />
              {r.category && <Badge variant="outline" className="text-xs">{r.category}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.description}</p>
            {r.submitter?.name && (
              <p className="text-sm mt-2">
                <span className="text-muted-foreground">Proposed by: </span>
                <span className="font-semibold">{r.submitter.name}</span>
              </p>
            )}
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="font-medium">
                {r.vote_count} / {r.votes_required} votes ({r.total_members} members)
              </span>
              {r.voting_closed_at && <span>Closed {formatDate(r.voting_closed_at)}</span>}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div className={`text-3xl font-bold ${passed ? "text-green-600" : "text-red-500"}`}>
              {passed ? "PASSED" : "FAILED"}
            </div>
            <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading} className="gap-1.5 text-xs">
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {downloading ? "Generating..." : "Download PDF"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
