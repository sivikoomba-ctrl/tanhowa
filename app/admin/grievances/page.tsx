"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MessageSquareWarning, Trash2, AlertTriangle, ArrowUp, ArrowRight, ArrowDown, Languages } from "lucide-react";
import { formatDate } from "@/lib/utils";

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "rejected", label: "Rejected" },
];

const statusColors: Record<string, string> = {
  pending: "secondary",
  in_progress: "default",
  resolved: "outline",
  rejected: "destructive",
};

const priorityOptions = [
  { value: "low", label: "Low", icon: ArrowDown, color: "text-blue-600" },
  { value: "medium", label: "Medium", icon: ArrowRight, color: "text-amber-600" },
  { value: "high", label: "High", icon: ArrowUp, color: "text-red-600" },
];

function getDaysPending(createdAt: string, status: string): { days: number; label: string; color: string } | null {
  if (status === "resolved" || status === "rejected") return null;
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days <= 3) return { days, label: `${days}d`, color: "text-green-600 bg-green-50" };
  if (days <= 7) return { days, label: `${days}d`, color: "text-amber-600 bg-amber-50" };
  return { days, label: `${days}d`, color: "text-red-600 bg-red-50" };
}

interface Grievance {
  id: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  admin_remarks: string;
  submitted_by: string;
  created_at: string;
  updated_at: string;
  users?: { name: string };
}

export default function AdminGrievancesPage() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [tab, setTab] = useState("pending");
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [previewLang, setPreviewLang] = useState<"en" | "ta">("en");

  const load = useCallback(() => {
    const langParam = previewLang === "ta" ? "&lang=ta" : "";
    fetch(`/api/grievances?type=grievance&status=${tab}${langParam}`)
      .then((r) => r.json())
      .then((d) => setGrievances(d.grievances || []))
      .catch(() => toast.error("Failed to load grievances"));
  }, [tab, previewLang]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(id: string, status: string) {
    const res = await fetch("/api/grievances", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, admin_remarks: remarks[id] }),
    });
    if (res.ok) {
      toast.success(`Status updated to ${status.replace("_", " ")}`);
      load();
    }
  }

  async function handlePriorityChange(id: string, priority: string) {
    const res = await fetch("/api/grievances", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, priority }),
    });
    if (res.ok) {
      toast.success(`Priority set to ${priority}`);
      load();
    }
  }

  async function handleSaveRemarks(id: string) {
    const res = await fetch("/api/grievances", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, admin_remarks: remarks[id] || "" }),
    });
    if (res.ok) {
      toast.success("Remarks saved");
      load();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this grievance?")) return;
    const res = await fetch(`/api/grievances?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Grievances</h1>
        <Button
          variant={previewLang === "ta" ? "default" : "outline"}
          size="sm"
          onClick={() => setPreviewLang(previewLang === "ta" ? "en" : "ta")}
          title="Preview content as Tamil-language members would see it. Source remains English; this only changes the displayed translation."
        >
          <Languages size={14} className="mr-1" />
          {previewLang === "ta" ? "Showing TA · click for EN" : "Preview as TA"}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {grievances.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquareWarning className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No {tab === "all" ? "" : tab.replace("_", " ")} grievances</p>
            </div>
          ) : (
            <div className="space-y-3">
              {grievances.map((g) => (
                <Card key={g.id}>
                  <CardContent className="pt-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <MessageSquareWarning className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-medium text-sm">{g.subject}</h3>
                              <Badge variant={statusColors[g.status] as "default" | "secondary" | "outline" | "destructive"} className="text-xs">
                                {statusOptions.find((s) => s.value === g.status)?.label || g.status}
                              </Badge>
                              {(() => {
                                const pri = priorityOptions.find((p) => p.value === (g.priority || "medium"));
                                const Icon = pri?.icon || ArrowRight;
                                return (
                                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${pri?.color || "text-amber-600"}`}>
                                    <Icon size={10} />{pri?.label || "Medium"}
                                  </span>
                                );
                              })()}
                              {(() => {
                                const sla = getDaysPending(g.created_at, g.status);
                                if (!sla) return null;
                                return (
                                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${sla.color}`}>
                                    <AlertTriangle size={9} />{sla.label} pending
                                  </span>
                                );
                              })()}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{g.description}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                              {g.category && <Badge variant="outline" className="text-xs">{g.category}</Badge>}
                              {g.users?.name && <span className="text-xs text-muted-foreground uppercase">by {g.users.name}</span>}
                              <span className="text-xs text-muted-foreground">
                                {formatDate(g.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={g.priority || "medium"}
                            onValueChange={(val) => handlePriorityChange(g.id, val)}
                          >
                            <SelectTrigger className="w-[100px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {priorityOptions.map((p) => (
                                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={g.status}
                            onValueChange={(val) => handleStatusChange(g.id, val)}
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {statusOptions.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => handleDelete(g.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>

                      {/* Admin remarks */}
                      <div className="ml-0 sm:ml-13">
                        <Textarea
                          placeholder="Add admin remarks..."
                          value={remarks[g.id] ?? g.admin_remarks ?? ""}
                          onChange={(e) => setRemarks({ ...remarks, [g.id]: e.target.value })}
                          rows={2}
                          className="text-xs"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1.5"
                          onClick={() => handleSaveRemarks(g.id)}
                        >
                          Save Remarks
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
