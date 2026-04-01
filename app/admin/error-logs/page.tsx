"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { AlertTriangle, Trash2, ChevronLeft, ChevronRight, RefreshCw, CheckCircle2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

const typeColors: Record<string, string> = {
  api: "default",
  client: "secondary",
  auth: "destructive",
};

interface ErrorLog {
  id: string;
  type: string;
  message: string;
  stack: string;
  path: string;
  method: string;
  status_code: number;
  user_id: string | null;
  metadata: Record<string, unknown>;
  status: string;
  resolved_at: string | null;
  created_at: string;
}

const REFRESH_INTERVAL = 30000; // 30 seconds

export default function AdminErrorLogsPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    fetch(`/api/error-logs?type=${tab}&page=${page}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs || []);
        setTotalPages(d.totalPages || 1);
        setTotal(d.total || 0);
        setUnresolvedCount(d.unresolvedCount || 0);
        setLastRefreshed(new Date());
      })
      .catch(() => toast.error("Failed to load error logs"));
  }, [tab, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  // Auto-refresh polling
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(load, REFRESH_INTERVAL);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, load]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this error log?")) return;
    const res = await fetch(`/api/error-logs?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      load();
    }
  }

  async function handleClearAll() {
    if (!confirm("Clear ALL error logs? This cannot be undone.")) return;
    const res = await fetch("/api/error-logs?id=all", { method: "DELETE" });
    if (res.ok) {
      toast.success("All logs cleared");
      load();
    }
  }

  async function handleResolve(id: string) {
    const res = await fetch("/api/error-logs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "resolved" }),
    });
    if (res.ok) {
      toast.success("Marked as resolved");
      load();
    }
  }

  async function handleResolveAll() {
    if (!confirm("Mark all unresolved errors as resolved?")) return;
    const res = await fetch("/api/error-logs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "all", status: "resolved" }),
    });
    if (res.ok) {
      toast.success("All errors marked as resolved");
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Error Logs</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">{total} total errors</p>
            {unresolvedCount > 0 && (
              <Badge variant="destructive" className="text-xs">{unresolvedCount} unresolved</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? "bg-primary hover:bg-primary/90" : ""}
          >
            <RefreshCw size={14} className={`mr-1 ${autoRefresh ? "animate-spin" : ""}`} style={autoRefresh ? { animationDuration: "3s" } : {}} />
            {autoRefresh ? "Live" : "Paused"}
          </Button>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw size={14} className="mr-1" />
            Refresh
          </Button>
          {unresolvedCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleResolveAll}>
              <CheckCircle2 size={14} className="mr-1" />
              Resolve All
            </Button>
          )}
          {logs.length > 0 && (
            <Button variant="destructive" size="sm" onClick={handleClearAll}>
              <Trash2 size={14} className="mr-1" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Last refreshed: {formatDateTime(lastRefreshed)} {autoRefresh && "(auto-refreshing every 30s)"}
      </p>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
          <TabsTrigger value="client">Client</TabsTrigger>
          <TabsTrigger value="auth">Auth</TabsTrigger>
          <TabsTrigger value="unresolved">Unresolved</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {logs.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No error logs</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <Card key={log.id} className={log.status === "resolved" ? "opacity-60" : ""}>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className="flex items-start gap-3 flex-1 cursor-pointer"
                        onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${log.status === "resolved" ? "bg-green-100" : "bg-destructive/10"}`}>
                          {log.status === "resolved"
                            ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                            : <AlertTriangle className="w-4 h-4 text-destructive" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={typeColors[log.type] as "default" | "secondary" | "destructive"} className="text-xs uppercase">
                              {log.type}
                            </Badge>
                            {log.status === "resolved" ? (
                              <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">Resolved</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-red-700 border-red-300 bg-red-50">Unresolved</Badge>
                            )}
                            {log.status_code > 0 && (
                              <Badge variant="outline" className="text-xs">{log.status_code}</Badge>
                            )}
                            {log.method && (
                              <Badge variant="outline" className="text-xs">{log.method}</Badge>
                            )}
                            {log.path && (
                              <span className="text-xs text-muted-foreground font-mono">{log.path}</span>
                            )}
                          </div>
                          <p className="text-sm mt-1 break-all">{log.message}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(log.created_at)}
                            </span>
                            {log.resolved_at && (
                              <span className="text-xs text-green-600">
                                Resolved: {formatDateTime(log.resolved_at)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {log.status !== "resolved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-700 hover:text-green-800 hover:bg-green-50"
                            onClick={() => handleResolve(log.id)}
                          >
                            <CheckCircle2 size={14} className="mr-1" />
                            Rectify
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive shrink-0"
                          onClick={() => handleDelete(log.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>

                    {expanded === log.id && log.stack && (
                      <div className="mt-3 ml-11">
                        <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                          {log.stack}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={14} />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
