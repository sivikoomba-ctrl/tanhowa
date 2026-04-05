"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Loader2 } from "lucide-react";

interface DailyData {
  date: string;
  views: number;
  sessions: number;
}

export default function AnalyticsCharts({ daily, loading }: { daily: DailyData[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp size={14} />Page Views Over Time
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : daily.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No data yet — analytics will appear after members start using the site</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" fontSize={10} tickFormatter={(v) => v.slice(5)} />
              <YAxis fontSize={10} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                labelFormatter={(v) => `Date: ${v}`}
              />
              <Area type="monotone" dataKey="views" stroke="#2d6a4f" fill="#2d6a4f" fillOpacity={0.15} strokeWidth={2} name="Views" />
              <Area type="monotone" dataKey="sessions" stroke="#d97706" fill="#d97706" fillOpacity={0.1} strokeWidth={2} name="Sessions" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
