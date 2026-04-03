"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { ClipboardList, Search, RefreshCw, User, Settings, FileText, Shield, CreditCard, Megaphone } from "lucide-react";

interface AuditLog {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const targetTypeIcons: Record<string, React.ElementType> = {
  user: User,
  subscription: CreditCard,
  announcement: Megaphone,
  grievance: FileText,
  task: ClipboardList,
  resolution: Shield,
  settings: Settings,
};

const targetTypeColors: Record<string, string> = {
  user: "bg-blue-50 text-blue-700 border-blue-200",
  subscription: "bg-green-50 text-green-700 border-green-200",
  announcement: "bg-purple-50 text-purple-700 border-purple-200",
  grievance: "bg-amber-50 text-amber-700 border-amber-200",
  task: "bg-indigo-50 text-indigo-700 border-indigo-200",
  resolution: "bg-red-50 text-red-700 border-red-200",
  poll: "bg-pink-50 text-pink-700 border-pink-200",
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (search) params.set("search", search);
      if (filterType !== "all") params.set("target_type", filterType);
      const res = await fetch(`/api/audit-logs?${params}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {
      toast.error("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [search, filterType]);

  useEffect(() => { load(); }, [load]);

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  const targetTypes = [...new Set(logs.map((l) => l.target_type).filter(Boolean))].sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Audit Log</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">{logs.length} entries</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or action..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {targetTypes.map((t) => (
              <SelectItem key={t} value={t!}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No audit logs" description="Admin actions will appear here once the audit_logs table is created" />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Recent Actions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-0 divide-y">
              {logs.map((log) => {
                const Icon = targetTypeIcons[log.target_type || ""] || ClipboardList;
                const typeColor = targetTypeColors[log.target_type || ""] || "bg-gray-50 text-gray-700 border-gray-200";
                return (
                  <div key={log.id} className="flex items-start gap-3 py-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${typeColor}`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{log.user_name || log.user_email || "System"}</span>
                        <span className="text-sm text-muted-foreground">{log.action.replace(/_/g, " ")}</span>
                        {log.target_type && (
                          <Badge variant="outline" className="text-[10px]">{log.target_type}</Badge>
                        )}
                      </div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(" | ")}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {formatTime(log.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
