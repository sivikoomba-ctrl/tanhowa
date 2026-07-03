"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { NotebookPen, Users, CheckCircle2, TrendingUp, AlertTriangle, MapPin } from "lucide-react";
import { toast } from "sonner";

interface DistrictRow {
  district: string;
  total: number;
  submitted: number;
  complianceRate: number;
}

interface NotSubmittedRow {
  id: string;
  name: string;
  district: string;
  photo_url: string | null;
}

interface MissedRow {
  id: string;
  name: string;
  district: string;
  lastSubmitted: string | null;
  daysMissed: number;
}

interface ComplianceData {
  date: string;
  scope: "all" | "district";
  district: string | null;
  totalMembers: number;
  totalSubmitted: number;
  complianceRate: number;
  districts: DistrictRow[];
  notSubmitted: NotSubmittedRow[];
  missedStreak: MissedRow[];
}

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function FieldDiaryCompliancePage() {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayIST());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/field-diary/compliance?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => toast.error(e.message || "Failed to load compliance data"))
      .finally(() => setLoading(false));
  }, [date]);

  const maxDaysMissed = Math.max(...(data?.missedStreak.map((m) => m.daysMissed) || [1]), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <NotebookPen className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Field Diary Compliance</h1>
            <p className="text-sm text-muted-foreground">Who has and hasn&apos;t logged their field diary{data?.district ? ` — ${data.district}` : ""}</p>
          </div>
        </div>
        <input
          type="date"
          value={date}
          max={todayIST()}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm bg-background w-fit"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <MetricCard label="Total Members" value={data?.totalMembers ?? 0} icon={Users} borderColor="border-l-primary" loading={loading} />
        <MetricCard label="Submitted Today" value={data?.totalSubmitted ?? 0} icon={CheckCircle2} borderColor="border-l-emerald-500" loading={loading} />
        <MetricCard label="Compliance Rate" value={`${data?.complianceRate ?? 0}%`} icon={TrendingUp} borderColor="border-l-blue-500" loading={loading} />
      </div>

      {data?.scope === "all" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" /> By District
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">District</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Members</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Submitted</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.districts || []).map((d) => (
                    <tr key={d.district} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5 font-medium">{d.district}</td>
                      <td className="px-3 py-2.5">{d.total}</td>
                      <td className="px-3 py-2.5">{d.submitted}</td>
                      <td className="px-3 py-2.5">
                        <Badge
                          variant="secondary"
                          className={
                            d.complianceRate >= 75 ? "bg-emerald-100 text-emerald-700" :
                            d.complianceRate >= 50 ? "bg-amber-100 text-amber-700" :
                            "bg-red-100 text-red-700"
                          }
                        >
                          {d.complianceRate}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Not Submitted ({data?.notSubmitted.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {loading ? (
              <div className="h-32 bg-muted rounded animate-pulse" />
            ) : (data?.notSubmitted.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Everyone has submitted today 🎉</p>
            ) : (
              data?.notSubmitted.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.district}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Missed 3+ Days ({data?.missedStreak.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {loading ? (
              <div className="h-32 bg-muted rounded animate-pulse" />
            ) : (data?.missedStreak.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No prolonged gaps</p>
            ) : (
              data?.missedStreak.map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-xs">
                  <span className="w-28 truncate text-muted-foreground" title={m.name}>{m.name}</span>
                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all duration-500"
                      style={{ width: `${(m.daysMissed / maxDaysMissed) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 text-right font-medium">{m.daysMissed}d</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
