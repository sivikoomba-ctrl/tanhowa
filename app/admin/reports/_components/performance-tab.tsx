"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status-badge";
import {
  UsersRound, CheckCircle, TrendingUp, Clock, FileDown,
  Trophy, Medal, Star, Users, ListTodo, Activity,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend,
  XAxis, YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { CHART_COLORS, CATEGORY_PALETTE } from "@/lib/chart-config";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface TeamPerformance {
  id: string;
  name: string;
  icon: string;
  tasksAssigned: number;
  tasksCompleted: number;
  completionRate: number;
  totalHoursLogged: number;
  contributionMinutes: number;
  activeMembers: number;
  totalMembers: number;
}

interface MemberPerformance {
  id: string;
  name: string;
  email: string;
  photo_url: string | null;
  role: string;
  official_type: string | null;
  teamNames: string[];
  tasksCommitted: number;
  tasksCompleted: number;
  tasksSubmitted: number;
  hoursLogged: number;
  contributionScore: number;
  actionCount: number;
  loginCount: number;
  lastActive: string | null;
  subscriptionCompliant: boolean;
}

interface CompletionTrend {
  month: string;
  completed: number;
  assigned: number;
}

interface Summary {
  totalTeams: number;
  totalMembers: number;
  totalTasksAssigned: number;
  totalTasksCompleted: number;
  totalHoursLogged: number;
  overallCompletionRate: number;
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 5) return "Online";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const PERIOD_OPTIONS = [
  { value: "month", label: "This Month" },
  { value: "3months", label: "Last 3 Months" },
  { value: "6months", label: "Last 6 Months" },
  { value: "all", label: "All Time" },
];

const rankIcons = [
  <Trophy key="1" size={16} className="text-yellow-500" />,
  <Medal key="2" size={16} className="text-gray-400" />,
  <Star key="3" size={16} className="text-amber-600" />,
];

export function PerformanceTab() {
  const [teams, setTeams] = useState<TeamPerformance[]>([]);
  const [members, setMembers] = useState<MemberPerformance[]>([]);
  const [trend, setTrend] = useState<CompletionTrend[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [allTeams, setAllTeams] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("month");
  const [teamFilter, setTeamFilter] = useState("all");

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/reports/performance?period=${period}&team=${teamFilter}`)
      .then((r) => r.json())
      .then((d) => {
        setTeams(d.teams || []);
        setMembers(d.members || []);
        setTrend(d.completionTrend || []);
        setSummary(d.summary || null);
        // Store all teams for filter (only on first load or when "all")
        if (teamFilter === "all" && d.teams?.length) {
          setAllTeams(d.teams.map((t: TeamPerformance) => ({ id: t.id, name: t.name })));
        }
      })
      .finally(() => setLoading(false));
  }, [period, teamFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const downloadPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const periodLabel = PERIOD_OPTIONS.find(p => p.value === period)?.label || period;
    const teamLabel = teamFilter === "all" ? "All Teams" : allTeams.find(t => t.id === teamFilter)?.name || "";

    doc.setFontSize(16);
    doc.text("TANHOWA - Performance Review Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${periodLabel} | Team: ${teamLabel} | Generated: ${new Date().toLocaleDateString()}`, 14, 22);

    // Team summary table
    if (teams.length > 0) {
      doc.setFontSize(12);
      doc.text("Team Performance", 14, 32);
      autoTable(doc, {
        startY: 35,
        head: [["Team", "Assigned", "Completed", "Rate %", "Hours", "Active / Total"]],
        body: teams.map(t => [
          t.name,
          t.tasksAssigned,
          t.tasksCompleted,
          `${t.completionRate}%`,
          t.totalHoursLogged,
          `${t.activeMembers} / ${t.totalMembers}`,
        ]),
        headStyles: { fillColor: [45, 106, 79], fontSize: 8 },
        styles: { fontSize: 8 },
      });
    }

    // Individual performance table
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastY = (doc as any).lastAutoTable?.finalY || 50;
    doc.setFontSize(12);
    doc.text("Individual Performance (Top 30)", 14, lastY + 10);
    autoTable(doc, {
      startY: lastY + 13,
      head: [["#", "Name", "Teams", "Tasks (C/T)", "Hours", "Contribution", "Logins", "Subscription"]],
      body: members.slice(0, 30).map((m, i) => [
        i + 1,
        m.name,
        m.teamNames.join(", ") || "-",
        `${m.tasksCompleted} / ${m.tasksCommitted}`,
        m.hoursLogged,
        formatMinutes(m.contributionScore),
        m.loginCount,
        m.subscriptionCompliant ? "Paid" : "Pending",
      ]),
      headStyles: { fillColor: [45, 106, 79], fontSize: 8 },
      styles: { fontSize: 7 },
    });

    doc.save(`TANHOWA_Performance_${periodLabel.replace(/\s/g, "_")}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!summary) {
    return <p className="text-center text-muted-foreground py-8">Failed to load performance data.</p>;
  }

  const trendData = trend.map((t) => ({
    ...t,
    label: new Date(t.month + "-01").toLocaleDateString("en", { month: "short", year: "2-digit" }),
  }));

  const trendConfig = {
    assigned: { label: "Assigned", color: CHART_COLORS.pending },
    completed: { label: "Completed", color: CHART_COLORS.completed },
  };

  const teamChartData = teams.map((t, i) => ({
    name: t.name.length > 15 ? t.name.slice(0, 14) + "..." : t.name,
    fullName: t.name,
    completed: t.tasksCompleted,
    hours: t.totalHoursLogged,
    fill: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
  }));

  const teamChartConfig = {
    completed: { label: "Tasks Completed", color: CHART_COLORS.completed },
    hours: { label: "Hours Logged", color: CHART_COLORS.in_progress },
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-3 flex-wrap">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {allTeams.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={downloadPDF} className="flex items-center gap-1.5">
            <FileDown size={14} /> Export PDF
          </Button>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <UsersRound size={20} className="mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{summary.totalTeams}</p>
            <p className="text-xs text-muted-foreground">Teams</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <CheckCircle size={20} className="mx-auto mb-1 text-green-600" />
            <p className="text-2xl font-bold">{summary.totalTasksCompleted} <span className="text-sm font-normal text-muted-foreground">/ {summary.totalTasksAssigned}</span></p>
            <p className="text-xs text-muted-foreground">Tasks Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <TrendingUp size={20} className="mx-auto mb-1 text-green-600" />
            <p className="text-2xl font-bold text-green-600">{summary.overallCompletionRate}%</p>
            <p className="text-xs text-muted-foreground">Completion Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Clock size={20} className="mx-auto mb-1 text-blue-600" />
            <p className="text-2xl font-bold">{summary.totalHoursLogged}h</p>
            <p className="text-xs text-muted-foreground">Hours Logged</p>
          </CardContent>
        </Card>
      </div>

      {/* Team Comparison Chart */}
      {teamChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Users size={14} /> Team Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={teamChartConfig} className="h-[280px] w-full">
              <BarChart data={teamChartData} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 9 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="completed" name="Tasks Completed" fill={CHART_COLORS.completed} radius={[0, 4, 4, 0]} barSize={14} />
                <Bar dataKey="hours" name="Hours Logged" fill={CHART_COLORS.in_progress} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Team Detail Cards */}
      {teams.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ListTodo size={14} /> Team Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => (
              <Card key={team.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {team.icon && <span>{team.icon}</span>}
                    {team.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Tasks Assigned</span>
                    <span className="font-medium text-right">{team.tasksAssigned}</span>
                    <span className="text-muted-foreground">Completed</span>
                    <span className="font-medium text-right">{team.tasksCompleted}</span>
                    <span className="text-muted-foreground">Hours Logged</span>
                    <span className="font-medium text-right">{team.totalHoursLogged}h</span>
                    <span className="text-muted-foreground">Contribution Time</span>
                    <span className="font-medium text-right">{formatMinutes(team.contributionMinutes)}</span>
                    <span className="text-muted-foreground">Active / Total</span>
                    <span className="font-medium text-right">{team.activeMembers} / {team.totalMembers}</span>
                  </div>
                  {/* Completion rate bar */}
                  <div className="pt-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Completion Rate</span>
                      <span className={`font-medium ${team.completionRate >= 75 ? "text-green-600" : team.completionRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                        {team.completionRate}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${team.completionRate >= 75 ? "bg-green-500" : team.completionRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${Math.min(team.completionRate, 100)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completion Trend */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp size={14} /> Task Completion Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendConfig} className="h-[280px] w-full">
              <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="assigned" name="Assigned" stroke={CHART_COLORS.pending} fill={CHART_COLORS.pending} fillOpacity={0.1} strokeWidth={2} />
                <Area type="monotone" dataKey="completed" name="Completed" stroke={CHART_COLORS.completed} fill={CHART_COLORS.completed} fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Individual Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Activity size={14} /> Individual Performance ({members.length} members)</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-center text-muted-foreground py-4 text-sm">No member data available for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead className="text-center">Tasks</TableHead>
                    <TableHead className="text-center">Hours</TableHead>
                    <TableHead className="text-center">Contributions</TableHead>
                    <TableHead className="text-center">Logins</TableHead>
                    <TableHead className="text-center">Last Active</TableHead>
                    <TableHead className="text-center">Subscription</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m, i) => {
                    const borderClass = i === 0 ? "border-l-4 border-l-yellow-400" : i === 1 ? "border-l-4 border-l-gray-300" : i === 2 ? "border-l-4 border-l-amber-600" : "";
                    return (
                      <TableRow key={m.id} className={borderClass}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1">
                            {i < 3 ? rankIcons[i] : i + 1}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={m.photo_url || undefined} />
                              <AvatarFallback className="text-[10px]">{(m.name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium leading-tight">{m.name || m.email}</p>
                              {m.teamNames.length > 0 && (
                                <div className="flex gap-1 mt-0.5 flex-wrap">
                                  {m.teamNames.map(tn => (
                                    <Badge key={tn} variant="secondary" className="text-[9px] px-1 py-0">{tn}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-green-600 font-medium">{m.tasksCompleted}</span>
                          <span className="text-muted-foreground text-xs"> / {m.tasksCommitted}</span>
                        </TableCell>
                        <TableCell className="text-center font-medium">{m.hoursLogged}h</TableCell>
                        <TableCell className="text-center">
                          <span className="font-medium">{formatMinutes(m.contributionScore)}</span>
                          <span className="text-muted-foreground text-xs block">{m.actionCount} actions</span>
                        </TableCell>
                        <TableCell className="text-center">{m.loginCount}</TableCell>
                        <TableCell className="text-center text-xs">{timeAgo(m.lastActive)}</TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={m.subscriptionCompliant ? "paid" : "pending"} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
