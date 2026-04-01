"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Clock, TrendingUp } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, XAxis, YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { CATEGORY_PALETTE, CHART_COLORS } from "@/lib/chart-config";

interface ActionBreakdown {
  action: string;
  label: string;
  count: number;
  minutes: number;
}

interface MonthlyTrend {
  month: string;
  count: number;
  minutes: number;
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function ContributionsTab() {
  const [byAction, setByAction] = useState<ActionBreakdown[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalActions, setTotalActions] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);

  useEffect(() => {
    fetch("/api/contributions?breakdown=true")
      .then((r) => r.json())
      .then((d) => {
        setByAction(d.byAction || []);
        setMonthlyTrend(d.monthlyTrend || []);
        setTotalActions((d.byAction || []).reduce((s: number, a: ActionBreakdown) => s + a.count, 0));
        setTotalMinutes((d.byAction || []).reduce((s: number, a: ActionBreakdown) => s + a.minutes, 0));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const pieData = byAction
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((a, i) => ({
      name: a.label,
      value: a.count,
      fill: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
    }));

  const barData = byAction
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10)
    .map((a, i) => ({
      name: a.label.length > 18 ? a.label.slice(0, 17) + "…" : a.label,
      fullName: a.label,
      minutes: a.minutes,
      count: a.count,
      fill: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
    }));

  const trendData = monthlyTrend.map((m) => ({
    ...m,
    label: new Date(m.month + "-01").toLocaleDateString("en", { month: "short", year: "2-digit" }),
  }));

  const pieConfig = Object.fromEntries(pieData.map((d) => [d.name, { label: d.name, color: d.fill }]));
  const trendConfig = {
    count: { label: "Actions", color: CHART_COLORS.primary },
    minutes: { label: "Minutes", color: CHART_COLORS.secondary },
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{totalActions}</p><p className="text-xs text-muted-foreground">Total Actions</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{formatMinutes(totalMinutes)}</p><p className="text-xs text-muted-foreground">Est. Total Time</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{byAction.length}</p><p className="text-xs text-muted-foreground">Action Types</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{monthlyTrend.length}</p><p className="text-xs text-muted-foreground">Months Tracked</p></CardContent></Card>
      </div>

      {/* Monthly Trend */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp size={14} /> Monthly Contribution Trend</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={trendConfig} className="h-[280px] w-full">
              <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="count" name="Actions" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="minutes" name="Minutes" stroke={CHART_COLORS.secondary} fill={CHART_COLORS.secondary} fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Action Breakdown Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pie chart - by count */}
        {pieData.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity size={14} /> Actions by Type</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={pieConfig} className="h-[280px] w-full">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={85} strokeWidth={2} stroke="#fff">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Bar chart - by time */}
        {barData.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock size={14} /> Time by Action Type</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={{ minutes: { label: "Minutes", color: CHART_COLORS.primary } }} className="h-[280px] w-full">
                <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 9 }} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${value} min`} />} />
                  <Bar dataKey="minutes" radius={[0, 6, 6, 0]}>
                    {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
