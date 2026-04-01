"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Vote, Check, X, Play, Square, Trash2, FileText, Send, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Resolution {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  submitted_by: string;
  approved_by: string;
  vote_count: number;
  votes_required: number;
  total_members: number;
  admin_remarks: string;
  voting_opened_at: string | null;
  voting_closed_at: string | null;
  approved_at: string | null;
  created_at: string;
  submitter?: { name: string };
  approver?: { name: string };
}

const statusStyles: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  voting_open: "bg-purple-100 text-purple-800",
  passed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  voting_open: "Voting Open",
  passed: "Passed",
  failed: "Failed",
};

export default function AdminResolutionsPage() {
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [tab, setTab] = useState("submitted");
  const [remarksId, setRemarksId] = useState<string | null>(null);
  const [remarksAction, setRemarksAction] = useState<string>("");
  const [remarks, setRemarks] = useState("");

  function loadResolutions() {
    fetch("/api/resolutions")
      .then((r) => r.json())
      .then((d) => setResolutions(d.resolutions || []))
      .catch(() => toast.error("Failed to load resolutions"));
  }

  useEffect(() => {
    loadResolutions();
  }, []);

  const filtered = useMemo(() => {
    if (tab === "all") return resolutions;
    return resolutions.filter((r) => r.status === tab);
  }, [resolutions, tab]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of resolutions) {
      c[r.status] = (c[r.status] || 0) + 1;
    }
    return c;
  }, [resolutions]);

  async function handleAction(resolutionId: string, action: string, extraRemarks?: string) {
    const res = await fetch("/api/resolutions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolutionId, action, remarks: extraRemarks || "" }),
    });
    if (res.ok) {
      const data = await res.json();
      if (action === "close_voting") {
        toast.success(`Voting closed — Resolution ${data.status === "passed" ? "PASSED" : "FAILED"} (${data.votes} votes)`);
      } else {
        toast.success("Resolution updated");
      }
      loadResolutions();
    } else {
      const data = await res.json();
      toast.error(data.error || "Action failed");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this resolution?")) return;
    const res = await fetch(`/api/resolutions?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Resolution deleted");
      loadResolutions();
    } else {
      const data = await res.json();
      toast.error(data.error || "Delete failed");
    }
  }

  function openRemarksDialog(id: string, action: string) {
    setRemarksId(id);
    setRemarksAction(action);
    setRemarks("");
  }

  function submitWithRemarks() {
    if (remarksId) {
      handleAction(remarksId, remarksAction, remarks);
      setRemarksId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Manage Resolutions</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">All ({resolutions.length})</TabsTrigger>
          <TabsTrigger value="submitted">
            Submitted {(counts.submitted || 0) > 0 && <span className="ml-1 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-xs">{counts.submitted}</span>}
          </TabsTrigger>
          <TabsTrigger value="approved">Approved ({counts.approved || 0})</TabsTrigger>
          <TabsTrigger value="voting_open">Voting ({counts.voting_open || 0})</TabsTrigger>
          <TabsTrigger value="passed">Passed ({counts.passed || 0})</TabsTrigger>
          <TabsTrigger value="failed">Failed ({counts.failed || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">
              No {tab === "all" ? "" : statusLabels[tab]?.toLowerCase() || ""} resolutions
            </p>
          ) : (
            <div className="space-y-4">
              {filtered.map((r) => {
                const percentage = r.votes_required > 0 ? Math.min(100, Math.round((r.vote_count / r.votes_required) * 100)) : 0;
                return (
                  <Card key={r.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-semibold">{r.title}</h3>
                            <Badge className={`text-xs ${statusStyles[r.status] || ""}`}>
                              {statusLabels[r.status] || r.status}
                            </Badge>
                            {r.category && <Badge variant="outline" className="text-xs">{r.category}</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3 mb-2">{r.description}</p>

                          {/* Vote progress for voting/passed/failed */}
                          {(r.status === "voting_open" || r.status === "passed" || r.status === "failed") && (
                            <div className="space-y-1 mb-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">
                                  {r.vote_count} / {r.votes_required} votes
                                </span>
                                <span className="text-muted-foreground">{percentage}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2.5">
                                <div
                                  className={`h-full rounded-full ${r.status === "passed" ? "bg-green-500" : r.status === "failed" ? "bg-red-400" : "bg-purple-500"}`}
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {r.admin_remarks && (
                            <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 mb-2">
                              <b>Remarks:</b> {r.admin_remarks}
                            </div>
                          )}

                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            {r.submitter?.name && <span>By: {r.submitter.name}</span>}
                            <span>Created: {formatDate(r.created_at)}</span>
                            {r.approved_at && <span>Approved: {formatDate(r.approved_at)}</span>}
                            {r.voting_opened_at && <span>Voting opened: {formatDate(r.voting_opened_at)}</span>}
                            {r.voting_closed_at && <span>Closed: {formatDate(r.voting_closed_at)}</span>}
                            <span>Members: {r.total_members} | Majority: {r.votes_required}</span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                          {r.status === "submitted" && (
                            <>
                              <Button size="sm" onClick={() => openRemarksDialog(r.id, "approve")} className="bg-primary hover:bg-primary/90">
                                <Check size={14} className="mr-1" />Approve
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => openRemarksDialog(r.id, "reject")}>
                                <X size={14} className="mr-1" />Reject
                              </Button>
                            </>
                          )}
                          {r.status === "approved" && (
                            <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={() => handleAction(r.id, "open_voting")}>
                              <Play size={14} className="mr-1" />Open Voting
                            </Button>
                          )}
                          {r.status === "voting_open" && (
                            <Button size="sm" variant="outline" onClick={() => {
                              if (confirm(`Close voting? Currently ${r.vote_count} votes. ${r.vote_count >= r.votes_required ? "Resolution will PASS." : "Resolution will FAIL."}`)) {
                                handleAction(r.id, "close_voting");
                              }
                            }}>
                              <Square size={14} className="mr-1" />Close Voting
                            </Button>
                          )}
                          {(r.status === "draft" || r.status === "submitted" || r.status === "rejected") && (
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(r.id)}>
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Remarks Dialog (for approve/reject) */}
      <Dialog open={!!remarksId} onOpenChange={(open) => { if (!open) setRemarksId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{remarksAction === "approve" ? "Approve Resolution" : "Reject Resolution"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Admin remarks (optional)"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
            />
            <Button
              onClick={submitWithRemarks}
              className={`w-full ${remarksAction === "approve" ? "bg-primary hover:bg-primary/90" : "bg-destructive hover:bg-destructive/90"}`}
            >
              {remarksAction === "approve" ? "Approve" : "Reject"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
