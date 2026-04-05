"use client";

import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MetricCard } from "@/components/metric-card";
import {
  Activity, Eye, Users, MonitorSmartphone, Smartphone, Monitor,
  MousePointerClick, BarChart3, Loader2,
} from "lucide-react";

const LazyCharts = lazy(() => import("./_charts"));

interface Summary {
  pageViews: number;
  clicks: number;
  uniqueUsers: number;
  uniqueSessions: number;
  avgPages: number;
}

interface PageData {
  path: string;
  views: number;
  uniqueUsers: number;
}

interface ClickData {
  text: string;
  page: string;
  count: number;
}

interface DeviceData {
  mobile: number;
  desktop: number;
  total: number;
}

interface DailyData {
  date: string;
  views: number;
  sessions: number;
}

interface PerfRoute {
  path: string;
  count: number;
  avgMs: number;
  maxMs: number;
  errors: number;
}

interface PerfData {
  routes: PerfRoute[];
  overallAvg: number;
  slowCount: number;
  totalRequests: number;
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [clicks, setClicks] = useState<ClickData[]>([]);
  const [devices, setDevices] = useState<DeviceData | null>(null);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [perf, setPerf] = useState<PerfData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, pRes, cRes, dRes, dlRes, pfRes] = await Promise.all([
        fetch(`/api/analytics?type=summary&period=${period}`),
        fetch(`/api/analytics?type=pages&period=${period}`),
        fetch(`/api/analytics?type=clicks&period=${period}`),
        fetch(`/api/analytics?type=devices&period=${period}`),
        fetch(`/api/analytics?type=daily&period=${period}`),
        fetch(`/api/analytics?type=perf&period=${period}`),
      ]);
      const [s, p, c, d, dl, pf] = await Promise.all([sRes.json(), pRes.json(), cRes.json(), dRes.json(), dlRes.json(), pfRes.json()]);
      setSummary(s);
      setPages(p.pages || []);
      setClicks(c.clicks || []);
      setDevices(d);
      setDaily(dl.daily || []);
      setPerf(pf.routes ? pf : null);
    } catch {
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const periods = [
    { value: "7d", label: "7 Days" },
    { value: "30d", label: "30 Days" },
    { value: "90d", label: "90 Days" },
  ];

  const mobilePercent = devices && devices.total > 0 ? Math.round((devices.mobile / devices.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Activity size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Site Analytics</h1>
            <p className="text-sm text-muted-foreground">Member usage statistics — private to you</p>
          </div>
        </div>
        <div className="flex gap-1">
          {periods.map((p) => (
            <Button
              key={p.value}
              size="sm"
              variant={period === p.value ? "default" : "outline"}
              className={period === p.value ? "bg-primary" : ""}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <MetricCard label="Page Views" value={summary?.pageViews || 0} icon={Eye} borderColor="border-blue-500" loading={loading} />
        <MetricCard label="Clicks" value={summary?.clicks || 0} icon={MousePointerClick} borderColor="border-purple-500" loading={loading} />
        <MetricCard label="Unique Users" value={summary?.uniqueUsers || 0} icon={Users} borderColor="border-green-500" loading={loading} />
        <MetricCard label="Sessions" value={summary?.uniqueSessions || 0} icon={Activity} borderColor="border-amber-500" loading={loading} />
        <MetricCard label="Pages/Session" value={summary?.avgPages || 0} icon={BarChart3} borderColor="border-teal-500" loading={loading} />
      </div>

      {/* Charts */}
      <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
        <LazyCharts daily={daily} loading={loading} />
      </Suspense>

      {/* Top Pages + Device breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Eye size={14} />Top Pages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : pages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No data yet</p>
            ) : (
              <div className="space-y-1">
                <div className="flex text-[10px] text-muted-foreground font-medium px-2 py-1">
                  <span className="flex-1">Page</span>
                  <span className="w-16 text-right">Views</span>
                  <span className="w-16 text-right">Users</span>
                </div>
                {pages.map((p, i) => (
                  <div key={p.path} className={`flex items-center text-sm px-2 py-1.5 rounded ${i < 3 ? "bg-primary/5" : ""}`}>
                    <span className="flex-1 truncate font-mono text-xs">{p.path}</span>
                    <span className="w-16 text-right font-semibold text-xs">{p.views}</span>
                    <span className="w-16 text-right text-xs text-muted-foreground">{p.uniqueUsers}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MonitorSmartphone size={14} />Devices
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : !devices || devices.total === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No data yet</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone size={16} className="text-blue-500" />
                    <span className="text-sm">Mobile</span>
                  </div>
                  <span className="text-sm font-semibold">{devices.mobile} ({mobilePercent}%)</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div className="bg-blue-500 h-3 rounded-full transition-all" style={{ width: `${mobilePercent}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Monitor size={16} className="text-green-500" />
                    <span className="text-sm">Desktop</span>
                  </div>
                  <span className="text-sm font-semibold">{devices.desktop} ({100 - mobilePercent}%)</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${100 - mobilePercent}%` }} />
                </div>
                <p className="text-xs text-muted-foreground text-center">{devices.total} total sessions</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Clicks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MousePointerClick size={14} />Top Clicked Elements
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : clicks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No click data yet</p>
          ) : (
            <div className="space-y-1">
              <div className="flex text-[10px] text-muted-foreground font-medium px-2 py-1">
                <span className="flex-1">Element</span>
                <span className="w-40 text-right">Page</span>
                <span className="w-16 text-right">Clicks</span>
              </div>
              {clicks.map((c, i) => (
                <div key={`${c.text}-${c.page}-${i}`} className={`flex items-center text-sm px-2 py-1.5 rounded ${i < 3 ? "bg-purple-50" : ""}`}>
                  <span className="flex-1 truncate text-xs">{c.text}</span>
                  <span className="w-40 text-right truncate font-mono text-[10px] text-muted-foreground">{c.page}</span>
                  <span className="w-16 text-right font-semibold text-xs">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Performance */}
      {perf && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity size={14} />API Performance (slow requests &gt;100ms)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{perf.overallAvg}ms</p>
                <p className="text-xs text-muted-foreground">Avg Response</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600">{perf.slowCount}</p>
                <p className="text-xs text-muted-foreground">Slow (&gt;1s)</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{perf.totalRequests}</p>
                <p className="text-xs text-muted-foreground">Total Tracked</p>
              </div>
            </div>
            {perf.routes.length > 0 && (
              <div className="space-y-1">
                <div className="flex text-[10px] text-muted-foreground font-medium px-2 py-1">
                  <span className="flex-1">Route</span>
                  <span className="w-14 text-right">Count</span>
                  <span className="w-16 text-right">Avg</span>
                  <span className="w-16 text-right">Max</span>
                  <span className="w-14 text-right">Errors</span>
                </div>
                {perf.routes.map((r) => (
                  <div key={r.path} className={`flex items-center text-sm px-2 py-1.5 rounded ${r.avgMs > 1000 ? "bg-red-50" : r.avgMs > 500 ? "bg-amber-50" : ""}`}>
                    <span className="flex-1 truncate font-mono text-xs">{r.path}</span>
                    <span className="w-14 text-right text-xs">{r.count}</span>
                    <span className={`w-16 text-right text-xs font-semibold ${r.avgMs > 1000 ? "text-red-600" : r.avgMs > 500 ? "text-amber-600" : "text-green-600"}`}>{r.avgMs}ms</span>
                    <span className="w-16 text-right text-xs text-muted-foreground">{r.maxMs}ms</span>
                    <span className={`w-14 text-right text-xs ${r.errors > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>{r.errors}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
