"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { NotebookPen, Users, TrendingUp, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface DistrictRow {
  name: string;
  members: number;
  expectedEntries: number;
  actualEntries: number;
  complianceRate: number;
  successStoriesFlagged: number;
  successStoriesPublished: number;
}

interface Highlight {
  id: string;
  district: string | null;
  entry_date: string;
  snippet: string;
  is_success_story: boolean;
  story_status: string;
}

interface FieldDiaryReport {
  from: string;
  to: string;
  days: number;
  totalMembers: number;
  totalActual: number;
  complianceRate: number;
  totalSuccessFlagged: number;
  totalSuccessPublished: number;
  districts: DistrictRow[];
  recentHighlights: Highlight[];
}

export function FieldDiaryTab() {
  const [data, setData] = useState<FieldDiaryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reports/field-diary?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => toast.error(e.message || "Failed to load field diary report"))
      .finally(() => setLoading(false));
  }, [days]);

  const maxRate = Math.max(...(data?.districts.map((d) => d.complianceRate) || [1]), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="px-3 py-2 border rounded-lg text-sm bg-background w-fit"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Members" value={data?.totalMembers ?? 0} icon={Users} borderColor="border-l-primary" loading={loading} />
        <MetricCard label="Entries Logged" value={data?.totalActual ?? 0} icon={NotebookPen} borderColor="border-l-blue-500" loading={loading} />
        <MetricCard label="Compliance Rate" value={`${data?.complianceRate ?? 0}%`} icon={TrendingUp} borderColor="border-l-emerald-500" loading={loading} />
        <MetricCard label="Stories Published" value={`${data?.totalSuccessPublished ?? 0} / ${data?.totalSuccessFlagged ?? 0}`} icon={Sparkles} borderColor="border-l-amber-500" loading={loading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compliance Rate by District</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="h-32 bg-muted rounded animate-pulse" />
          ) : (data?.districts.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No data for this period</p>
          ) : (
            data?.districts.map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="w-28 truncate text-right text-muted-foreground" title={d.name}>{d.name}</span>
                <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${(d.complianceRate / maxRate) * 100}%` }}
                  />
                </div>
                <span className="w-28 text-right font-medium">{d.actualEntries}/{d.expectedEntries} ({d.complianceRate}%)</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Recent Field Highlights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="h-24 bg-muted rounded animate-pulse" />
          ) : (data?.recentHighlights.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No entries yet in this period</p>
          ) : (
            data?.recentHighlights.map((h) => (
              <div key={h.id} className="border-b pb-2 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {new Date(h.entry_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </span>
                  {h.district && <Badge variant="outline" className="text-[10px]">{h.district}</Badge>}
                  {h.is_success_story && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Success Story</Badge>}
                  {h.story_status === "published" && <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">Published</Badge>}
                </div>
                <p className="text-sm text-foreground">{h.snippet}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
