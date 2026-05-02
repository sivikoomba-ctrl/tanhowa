"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import {
  BarChart3,
  Trophy,
  Medal,
  MapPin,
  IndianRupee,
  Users,
  TrendingUp,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";

interface DistrictData {
  name: string;
  members: number;
  activeMembers: number;
  totalContribMinutes: number;
  subsPaid: number;
  subsTotal: number;
  collectionAmount: number;
  tasksCompleted: number;
  tasksAssigned: number;
  totalLogins: number;
  rsvpCount: number;
  newMembers: number;
  paymentRate: number;
  activeRate: number;
  completionRate: number;
  avgContribMinutes: number;
  avgLogins: number;
  score: number;
}

type SortKey = "score" | "name" | "members" | "activeMembers" | "paymentRate" | "collectionAmount" | "tasksCompleted" | "avgContribMinutes";

export default function DistrictBenchmarkPage() {
  const [districts, setDistricts] = useState<DistrictData[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(new Date().getFullYear().toString());
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reports/district-benchmark?period=${period}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setDistricts(d.districts || []);
      })
      .catch((e) => toast.error(e.message || "Failed to load benchmark data"))
      .finally(() => setLoading(false));
  }, [period]);

  const sorted = useMemo(() => {
    const copy = [...districts];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return copy;
  }, [districts, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const totalCollection = districts.reduce((s, d) => s + d.collectionAmount, 0);
  const avgPaymentRate = districts.length > 0
    ? Math.round(districts.reduce((s, d) => s + d.paymentRate, 0) / districts.length)
    : 0;
  const topDistrict = districts.length > 0 ? districts[0]?.name : "-";

  const rankIcon = (i: number) => {
    if (i === 0) return <Trophy className="w-4 h-4 text-yellow-500" />;
    if (i === 1) return <Medal className="w-4 h-4 text-gray-400" />;
    if (i === 2) return <Medal className="w-4 h-4 text-amber-600" />;
    return null;
  };

  const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - 2 + i).toString());

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none whitespace-nowrap"
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className="w-3 h-3" />
      </span>
    </th>
  );

  // Find max values for bar chart scaling
  const maxPaymentRate = Math.max(...districts.map(d => d.paymentRate), 1);
  const maxActiveRate = Math.max(...districts.map(d => d.activeRate), 1);
  const maxCompletionRate = Math.max(...districts.map(d => d.completionRate), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <BarChart3 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">District Benchmark</h1>
            <p className="text-sm text-muted-foreground">Compare district performance across key metrics</p>
          </div>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm bg-background w-fit"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="Districts"
          value={districts.length}
          icon={MapPin}
          borderColor="border-l-primary"
          loading={loading}
        />
        <MetricCard
          label="Avg Payment Rate"
          value={`${avgPaymentRate}%`}
          icon={TrendingUp}
          borderColor="border-l-emerald-500"
          loading={loading}
        />
        <MetricCard
          label="Top District"
          value={topDistrict}
          icon={Trophy}
          borderColor="border-l-yellow-500"
          loading={loading}
        />
        <MetricCard
          label="Total Collection"
          value={`Rs.${totalCollection.toLocaleString("en-IN")}`}
          icon={IndianRupee}
          borderColor="border-l-blue-500"
          loading={loading}
        />
      </div>

      {/* Ranked Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            District Rankings — {period}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-10">#</th>
                  <SortHeader label="District" field="name" />
                  <SortHeader label="Members" field="members" />
                  <SortHeader label="Active (30d)" field="activeMembers" />
                  <SortHeader label="Payment Rate" field="paymentRate" />
                  <SortHeader label="Collection" field="collectionAmount" />
                  <SortHeader label="Tasks Done" field="tasksCompleted" />
                  <SortHeader label="Avg Contrib (min)" field="avgContribMinutes" />
                  <SortHeader label="Score" field="score" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-3 py-3">
                          <div className="h-4 bg-muted rounded animate-pulse w-16" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                      No district data available for {period}
                    </td>
                  </tr>
                ) : (
                  sorted.map((d) => {
                    // Find original rank (by score)
                    const originalRank = districts.findIndex(od => od.name === d.name);
                    return (
                      <tr key={d.name} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2.5 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {rankIcon(originalRank)}
                            {originalRank + 1}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-medium">{d.name}</td>
                        <td className="px-3 py-2.5">{d.members}</td>
                        <td className="px-3 py-2.5">
                          {d.activeMembers}
                          <span className="text-muted-foreground text-xs ml-1">({d.activeRate}%)</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant="secondary"
                            className={
                              d.paymentRate >= 75 ? "bg-emerald-100 text-emerald-700" :
                              d.paymentRate >= 50 ? "bg-amber-100 text-amber-700" :
                              "bg-red-100 text-red-700"
                            }
                          >
                            {d.paymentRate}%
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">Rs.{d.collectionAmount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-2.5">{d.tasksCompleted}/{d.tasksAssigned}</td>
                        <td className="px-3 py-2.5">{d.avgContribMinutes}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className="font-bold">{d.score}</Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Bar Charts */}
      {!loading && districts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Payment Rate */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-emerald-700">Payment Rate by District</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...districts].sort((a, b) => b.paymentRate - a.paymentRate).slice(0, 15).map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="w-24 truncate text-right text-muted-foreground" title={d.name}>{d.name}</span>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${(d.paymentRate / maxPaymentRate) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-medium">{d.paymentRate}%</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Active Members */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-blue-700">Active Members % by District</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...districts].sort((a, b) => b.activeRate - a.activeRate).slice(0, 15).map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="w-24 truncate text-right text-muted-foreground" title={d.name}>{d.name}</span>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${(d.activeRate / maxActiveRate) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-medium">{d.activeRate}%</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Task Completion Rate */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-amber-700">Task Completion Rate by District</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...districts].sort((a, b) => b.completionRate - a.completionRate).slice(0, 15).map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="w-24 truncate text-right text-muted-foreground" title={d.name}>{d.name}</span>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${(d.completionRate / maxCompletionRate) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-medium">{d.completionRate}%</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
