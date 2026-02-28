"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { AlertTriangle, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

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
  created_at: string;
}

export default function AdminErrorLogsPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  function load() {
    fetch(`/api/error-logs?type=${tab}&page=${page}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs || []);
        setTotalPages(d.totalPages || 1);
        setTotal(d.total || 0);
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, [tab, page]);

  useEffect(() => {
    setPage(1);
  }, [tab]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Error Logs</h1>
          <p className="text-sm text-muted-foreground">{total} total errors captured</p>
        </div>
        {logs.length > 0 && (
          <Button variant="destructive" size="sm" onClick={handleClearAll}>
            <Trash2 size={14} className="mr-1" />
            Clear All
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
          <TabsTrigger value="client">Client</TabsTrigger>
          <TabsTrigger value="auth">Auth</TabsTrigger>
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
                <Card key={log.id}>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className="flex items-start gap-3 flex-1 cursor-pointer"
                        onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                      >
                        <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                          <AlertTriangle className="w-4 h-4 text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={typeColors[log.type] as "default" | "secondary" | "destructive"} className="text-xs uppercase">
                              {log.type}
                            </Badge>
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
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive shrink-0"
                        onClick={() => handleDelete(log.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
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
