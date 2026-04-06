"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, IndianRupee, ListTodo, MessageSquareWarning, Award,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  XAxis, YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { subscriptionStatusConfig, taskStatusConfig, CHART_COLORS } from "@/lib/chart-config";

interface OverviewData {
  members: { total: number; pending: number; activeThisWeek: number; newThisMonth: number };
  subscriptions: { totalCollected: number; collectionRate: number; byPeriod: { period: string; paid: number; pending: number; overdue: number; hold: number; rejected: number; collected: number; total: number }[] };
  tasks: { total: number; completionRate: number; breakdown: Record<string, number> };
  grievances: { total: number; suggestions: number; resolutionRate: number };
  contributions: { actionsThisMonth: number; minutesThisMonth: number };
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function OverviewTab() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports/overview")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!data || !data.members) return <p className="text-center text-muted-foreground py-8">Failed to load overview.</p>;

  // Task donut data
  const taskDonutData = Object.entries(data.tasks.breakdown).map(([status, count]) => ({
    name: taskStatusConfig[status]?.label || status,
    value: count,
    fill: (taskStatusConfig[status] as { color?: string })?.color || "#9ca3af",
  }));

  // Collection rate gauge data
  const collectionRateData = [
    { name: "Collected", value: data.subscriptions.collectionRate, fill: CHART_COLORS.paid },
    { name: "Remaining", value: 100 - data.subscriptions.collectionRate, fill: "#e5e7eb" },
  ];

  const taskStatusLabels: Record<string, string> = { pending: "Pending", approved: "Approved", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled", review: "Review" };

  return (
    <div className="space-y-6">
      {/* Members */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2"><Users size={14} /> Members</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{data.members.total}</p><p className="text-xs text-muted-foreground">Total Approved</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-green-700">{data.members.activeThisWeek}</p><p className="text-xs text-muted-foreground">Active This Week</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-blue-700">{data.members.newThisMonth}</p><p className="text-xs text-muted-foreground">New This Month</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-amber-700">{data.members.pending}</p><p className="text-xs text-muted-foreground">Pending Approval</p></CardContent></Card>
        </div>
      </div>

      {/* Collection */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2"><IndianRupee size={14} /> Collection</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">₹{data.subscriptions.totalCollected.toLocaleString("en-IN")}</p><p className="text-xs text-muted-foreground">Total Collected</p></CardContent></Card>

          {/* Collection Rate Donut */}
          <Card>
            <CardContent className="pt-4 flex flex-col items-center">
              <ChartContainer config={{ collected: { label: "Collected", color: CHART_COLORS.paid }, remaining: { label: "Remaining", color: "#e5e7eb" } }} className="h-[120px] w-[120px]">
                <PieChart>
                  <Pie data={collectionRateData} dataKey="value" innerRadius={35} outerRadius={50} strokeWidth={0}>
                    {collectionRateData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <p className="text-2xl font-bold -mt-[76px] mb-[42px]">{data.subscriptions.collectionRate}%</p>
              <p className="text-xs text-muted-foreground">Collection Rate</p>
            </CardContent>
          </Card>

          {/* Subscriptions Due */}
          <Card><CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-amber-700">{data.subscriptions.byPeriod.reduce((s, p) => s + p.pending + p.overdue, 0)}</p>
            <p className="text-xs text-muted-foreground">Pending + Overdue</p>
          </CardContent></Card>
        </div>

        {/* Collection by Period - Stacked Bar Chart */}
        {data.subscriptions.byPeriod.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Collection by Period</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={subscriptionStatusConfig} className="h-[280px] w-full">
                <BarChart data={data.subscriptions.byPeriod} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="paid" stackId="status" fill={CHART_COLORS.paid} name="Paid" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pending" stackId="status" fill={CHART_COLORS.pending} name="Pending" />
                  <Bar dataKey="overdue" stackId="status" fill={CHART_COLORS.overdue} name="Overdue" />
                  <Bar dataKey="hold" stackId="status" fill={CHART_COLORS.hold} name="Hold" />
                  <Bar dataKey="rejected" stackId="status" fill={CHART_COLORS.rejected} name="Rejected" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tasks - with donut */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2"><ListTodo size={14} /> Tasks</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{data.tasks.total}</p><p className="text-xs text-muted-foreground">Total Tasks</p></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-green-700">{data.tasks.completionRate}%</p><p className="text-xs text-muted-foreground">Completion Rate</p></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{data.tasks.breakdown["in_progress"] || 0}</p><p className="text-xs text-muted-foreground">In Progress</p></CardContent></Card>
          </div>

          {/* Task Status Donut */}
          {taskDonutData.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <ChartContainer config={taskStatusConfig} className="h-[200px] w-full">
                  <PieChart>
                    <Pie data={taskDonutData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} strokeWidth={2} stroke="#fff">
                      {taskDonutData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(data.tasks.breakdown).map(([status, count]) => (
            <Badge key={status} variant="outline" className="text-xs">
              {taskStatusLabels[status] || status}: {count}
            </Badge>
          ))}
        </div>
      </div>

      {/* Grievances & Suggestions */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2"><MessageSquareWarning size={14} /> Grievances & Suggestions</h3>
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{data.grievances.total}</p><p className="text-xs text-muted-foreground">Grievances</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{data.grievances.suggestions}</p><p className="text-xs text-muted-foreground">Suggestions</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-green-700">{data.grievances.resolutionRate}%</p><p className="text-xs text-muted-foreground">Resolved</p></CardContent></Card>
        </div>
      </div>

      {/* Contributions */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2"><Award size={14} /> Contributions (This Month)</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{data.contributions.actionsThisMonth}</p><p className="text-xs text-muted-foreground">Actions</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{formatMinutes(data.contributions.minutesThisMonth)}</p><p className="text-xs text-muted-foreground">Est. Time</p></CardContent></Card>
        </div>
      </div>
    </div>
  );
}
