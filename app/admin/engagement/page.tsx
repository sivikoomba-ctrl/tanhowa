"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";
import {
  TrendingUp,
  Users,
  UserX,
  AlertTriangle,
  Activity,
  ChevronDown,
  ChevronUp,
  Zap,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

interface FeatureAdoptionItem {
  action: string;
  uniqueUsers: number;
  totalUses: number;
  totalMinutes: number;
}

interface InactiveMember {
  id: string;
  name: string;
  email: string;
  lastActive: string | null;
  loginCount: number;
  daysInactive: number | null;
}

interface ChurnRiskMember {
  id: string;
  name: string;
  email: string;
  lastActive: string;
  loginCount: number;
  daysInactive: number;
}

interface TrendItem {
  month: string;
  activeUsers: number;
}

export default function EngagementPage() {
  const [loading, setLoading] = useState(true);
  const [dau, setDau] = useState(0);
  const [wau, setWau] = useState(0);
  const [mau, setMau] = useState(0);
  const [totalMembers, setTotalMembers] = useState(0);
  const [inactiveCount, setInactiveCount] = useState(0);
  const [featureAdoption, setFeatureAdoption] = useState<FeatureAdoptionItem[]>([]);
  const [inactiveMembers, setInactiveMembers] = useState<InactiveMember[]>([]);
  const [churnRisk, setChurnRisk] = useState<ChurnRiskMember[]>([]);
  const [engagementTrend, setEngagementTrend] = useState<TrendItem[]>([]);
  const [showAllInactive, setShowAllInactive] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/reports/engagement")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setDau(d.loginFrequency?.dau || 0);
        setWau(d.loginFrequency?.wau || 0);
        setMau(d.loginFrequency?.mau || 0);
        setTotalMembers(d.totalMembers || 0);
        setInactiveCount(d.inactiveCount || 0);
        setFeatureAdoption(d.featureAdoption || []);
        setInactiveMembers(d.inactiveMembers || []);
        setChurnRisk(d.churnRisk || []);
        setEngagementTrend(d.engagementTrend || []);
      })
      .catch((e) => toast.error(e.message || "Failed to load engagement data"))
      .finally(() => setLoading(false));
  }, []);

  const maxTrendUsers = Math.max(...engagementTrend.map(t => t.activeUsers), 1);

  function formatAction(action: string): string {
    return action
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatMonth(m: string): string {
    const [year, month] = m.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[parseInt(month) - 1]} ${year}`;
  }

  function formatDate(d: string | null): string {
    if (!d) return "Never";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 rounded-xl">
          <TrendingUp className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Engagement Analytics</h1>
          <p className="text-sm text-muted-foreground">Member activity, feature adoption, and retention insights</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="DAU (24h)"
          value={dau}
          subtitle={totalMembers > 0 ? `${Math.round((dau / totalMembers) * 100)}% of members` : undefined}
          icon={Zap}
          borderColor="border-l-emerald-500"
          loading={loading}
        />
        <MetricCard
          label="WAU (7d)"
          value={wau}
          subtitle={totalMembers > 0 ? `${Math.round((wau / totalMembers) * 100)}% of members` : undefined}
          icon={Activity}
          borderColor="border-l-blue-500"
          loading={loading}
        />
        <MetricCard
          label="MAU (30d)"
          value={mau}
          subtitle={totalMembers > 0 ? `${Math.round((mau / totalMembers) * 100)}% of members` : undefined}
          icon={Users}
          borderColor="border-l-purple-500"
          loading={loading}
        />
        <MetricCard
          label="Inactive"
          value={inactiveCount}
          subtitle={totalMembers > 0 ? `${Math.round((inactiveCount / totalMembers) * 100)}% of members` : undefined}
          icon={UserX}
          borderColor="border-l-red-500"
          loading={loading}
        />
      </div>

      {/* Engagement Trend */}
      {!loading && engagementTrend.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Monthly Active Users — Last 6 Months
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-48">
              {engagementTrend.map((t) => (
                <div key={t.month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-medium">{t.activeUsers}</span>
                  <div className="w-full bg-muted rounded-t-md overflow-hidden" style={{ height: "100%" }}>
                    <div
                      className="w-full bg-primary/70 rounded-t-md transition-all duration-500"
                      style={{
                        height: `${(t.activeUsers / maxTrendUsers) * 100}%`,
                        marginTop: `${100 - (t.activeUsers / maxTrendUsers) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatMonth(t.month)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Feature Adoption */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Feature Adoption (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Action</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase">Users</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase">Uses</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase">Minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {[1, 2, 3, 4].map(j => (
                          <td key={j} className="px-3 py-2.5"><div className="h-4 bg-muted rounded animate-pulse w-16" /></td>
                        ))}
                      </tr>
                    ))
                  ) : featureAdoption.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No data</td></tr>
                  ) : (
                    featureAdoption.map((f) => (
                      <tr key={f.action} className="border-b hover:bg-muted/20">
                        <td className="px-3 py-2">{formatAction(f.action)}</td>
                        <td className="px-3 py-2 text-right">{f.uniqueUsers}</td>
                        <td className="px-3 py-2 text-right">{f.totalUses}</td>
                        <td className="px-3 py-2 text-right">{f.totalMinutes}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* At-Risk Members (Churn) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              At-Risk Members
              {churnRisk.length > 0 && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-700">{churnRisk.length}</Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">Previously active members (5+ logins) inactive for 14+ days</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Last Active</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase">Logins</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase">Days Away</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {[1, 2, 3, 4].map(j => (
                          <td key={j} className="px-3 py-2.5"><div className="h-4 bg-muted rounded animate-pulse w-16" /></td>
                        ))}
                      </tr>
                    ))
                  ) : churnRisk.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No at-risk members</td></tr>
                  ) : (
                    churnRisk.slice(0, 20).map((m) => (
                      <tr key={m.id} className="border-b hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <div className="font-medium">{m.name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{m.email}</div>
                        </td>
                        <td className="px-3 py-2 text-xs">{formatDate(m.lastActive)}</td>
                        <td className="px-3 py-2 text-right">{m.loginCount}</td>
                        <td className="px-3 py-2 text-right">
                          <Badge
                            variant="secondary"
                            className={
                              m.daysInactive > 30 ? "bg-red-100 text-red-700" :
                              m.daysInactive > 21 ? "bg-amber-100 text-amber-700" :
                              "bg-yellow-100 text-yellow-700"
                            }
                          >
                            {m.daysInactive}d
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inactive Members (Collapsible) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <UserX className="w-4 h-4 text-red-500" />
              Inactive Members (30+ days)
              {inactiveCount > 0 && (
                <Badge variant="secondary" className="bg-red-100 text-red-700">{inactiveCount}</Badge>
              )}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllInactive(!showAllInactive)}
              className="text-xs"
            >
              {showAllInactive ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
              {showAllInactive ? "Collapse" : "Expand"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Members with no activity in 30+ days or who never logged in</p>
        </CardHeader>
        {showAllInactive && (
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Email</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Last Active</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase">Logins</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase">Days Away</th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveMembers.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No inactive members</td></tr>
                  ) : (
                    inactiveMembers.map((m) => (
                      <tr key={m.id} className="border-b hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{m.name || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{m.email}</td>
                        <td className="px-3 py-2 text-xs">{formatDate(m.lastActive)}</td>
                        <td className="px-3 py-2 text-right">{m.loginCount}</td>
                        <td className="px-3 py-2 text-right">
                          {m.daysInactive !== null ? (
                            <span className="text-red-600 font-medium">{m.daysInactive}d</span>
                          ) : (
                            <span className="text-muted-foreground">Never</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
