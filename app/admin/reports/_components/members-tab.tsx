"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MapPin, UserCheck, TrendingUp } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Legend, Pie, PieChart, XAxis, YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { CHART_COLORS, CATEGORY_PALETTE } from "@/lib/chart-config";

interface MembersReport {
  registrationTrend: { month: string; count: number; cumulative: number }[];
  districtDistribution: { district: string; count: number }[];
  profileCompletion: { complete: number; partial: number; minimal: number };
  loginActivity: { activeThisWeek: number; activeThisMonth: number; neverLoggedIn: number; averageLoginCount: number };
}

export function MembersTab() {
  const [data, setData] = useState<MembersReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports/members")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!data) return <p className="text-center text-muted-foreground py-8">Failed to load member analytics.</p>;

  const trendData = data.registrationTrend.map((m) => ({
    ...m,
    label: new Date(m.month + "-01").toLocaleDateString("en", { month: "short", year: "2-digit" }),
  }));

  const districtData = data.districtDistribution
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map((d) => ({
      name: d.district.length > 12 ? d.district.slice(0, 11) + "…" : d.district,
      fullName: d.district,
      count: d.count,
    }));

  const profileData = [
    { name: "Complete", value: data.profileCompletion.complete, fill: CHART_COLORS.paid },
    { name: "Partial", value: data.profileCompletion.partial, fill: CHART_COLORS.pending },
    { name: "Minimal", value: data.profileCompletion.minimal, fill: CHART_COLORS.overdue },
  ].filter((d) => d.value > 0);

  const totalMembers = data.profileCompletion.complete + data.profileCompletion.partial + data.profileCompletion.minimal;

  const trendConfig = { cumulative: { label: "Total Members", color: CHART_COLORS.primary }, count: { label: "New Members", color: CHART_COLORS.secondary } };
  const profileConfig = { complete: { label: "Complete", color: CHART_COLORS.paid }, partial: { label: "Partial", color: CHART_COLORS.pending }, minimal: { label: "Minimal", color: CHART_COLORS.overdue } };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{totalMembers}</p><p className="text-xs text-muted-foreground">Total Members</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-green-700">{data.loginActivity.activeThisWeek}</p><p className="text-xs text-muted-foreground">Active This Week</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-blue-700">{data.loginActivity.activeThisMonth}</p><p className="text-xs text-muted-foreground">Active This Month</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-amber-700">{data.loginActivity.neverLoggedIn}</p><p className="text-xs text-muted-foreground">Never Logged In</p></CardContent></Card>
      </div>

      {/* Registration Trend */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp size={14} /> Member Registration Trend</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={trendConfig} className="h-[280px] w-full">
              <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="cumulative" name="Total Members" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="count" name="New Members" stroke={CHART_COLORS.secondary} fill={CHART_COLORS.secondary} fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* District + Profile Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* District Distribution */}
        {districtData.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><MapPin size={14} /> Members by District</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={{ count: { label: "Members", color: CHART_COLORS.primary } }} className="h-[320px] w-full">
                <BarChart data={districtData} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {districtData.map((_, i) => <Cell key={i} fill={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Profile Completion */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><UserCheck size={14} /> Profile Completion</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={profileConfig} className="h-[280px] w-full">
              <PieChart>
                <Pie data={profileData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} strokeWidth={2} stroke="#fff">
                  {profileData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ChartContainer>
            <div className="mt-2 text-center">
              <p className="text-xs text-muted-foreground">
                Complete: name, phone, occupation, district, photo filled.
                Partial: name + phone + occupation. Minimal: name only or less.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Login Activity */}
      <Card>
        <CardContent className="pt-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Users size={14} /> Login Activity</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-xl bg-muted/30">
              <p className="text-lg font-bold text-green-700">{data.loginActivity.activeThisWeek}</p>
              <p className="text-xs text-muted-foreground">Active this week</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/30">
              <p className="text-lg font-bold text-blue-700">{data.loginActivity.activeThisMonth}</p>
              <p className="text-xs text-muted-foreground">Active this month</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/30">
              <p className="text-lg font-bold text-amber-700">{data.loginActivity.neverLoggedIn}</p>
              <p className="text-xs text-muted-foreground">Never logged in</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/30">
              <p className="text-lg font-bold">{data.loginActivity.averageLoginCount.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Avg. login count</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
