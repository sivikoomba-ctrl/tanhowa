"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Award, Clock, Activity, Trophy, Medal, Star, Users, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface LeaderboardEntry {
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  total_minutes: number;
  action_count: number;
  actions: Record<string, number>;
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const RANK_ICONS = [
  <Trophy key="1" className="w-5 h-5 text-yellow-500" />,
  <Medal key="2" className="w-5 h-5 text-gray-400" />,
  <Star key="3" className="w-5 h-5 text-amber-600" />,
];

export default function AdminContributionsPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/contributions?period=${period}`)
      .then((r) => r.json())
      .then((data) => {
        setLeaderboard(data.leaderboard || []);
        setTotal(data.total || 0);
      })
      .finally(() => setLoading(false));
  }, [period]);

  const totalMinutes = leaderboard.reduce((sum, e) => sum + e.total_minutes, 0);

  function downloadPDF() {
    if (leaderboard.length === 0) return;
    const doc = new jsPDF();
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const periodLabel = period === "week" ? "This Week" : period === "month" ? "This Month" : "All Time";

    doc.setFontSize(16);
    doc.text("TANHOWA - Contributions Leaderboard", 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Period: ${periodLabel}  |  Generated: ${today}  |  Contributors: ${leaderboard.length}  |  Total Time: ${formatMinutes(totalMinutes)}`, 14, 22);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 28,
      head: [["Rank", "Name", "Email", "Actions", "Est. Time"]],
      body: leaderboard.map((e, i) => [
        i + 1,
        e.name,
        e.email,
        e.action_count,
        formatMinutes(e.total_minutes),
      ]),
      theme: "grid",
      headStyles: { fillColor: [45, 106, 79], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14 },
    });

    doc.save(`Contributions-Leaderboard-${periodLabel.replace(/\s+/g, "-")}.pdf`);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contributions Leaderboard</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadPDF} disabled={leaderboard.length === 0}>
            <FileDown size={14} className="mr-1" /> PDF
          </Button>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Users className="w-6 h-6 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{leaderboard.length}</p>
            <p className="text-xs text-muted-foreground">Contributors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Activity className="w-6 h-6 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-muted-foreground">Total Actions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Clock className="w-6 h-6 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{formatMinutes(totalMinutes)}</p>
            <p className="text-xs text-muted-foreground">Total Est. Time</p>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : leaderboard.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No contributions recorded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((entry, index) => (
            <Card key={entry.user_id} className={index < 3 ? "border-primary/30" : ""}>
              <CardContent className="py-3">
                <div className="flex items-center gap-4">
                  {/* Rank */}
                  <div className="w-8 text-center shrink-0">
                    {index < 3 ? RANK_ICONS[index] : (
                      <span className="text-sm font-bold text-muted-foreground">#{index + 1}</span>
                    )}
                  </div>

                  {/* Avatar */}
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={entry.avatar_url || undefined} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {entry.name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "?"}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name & email */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{entry.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{entry.email}</p>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold">{formatMinutes(entry.total_minutes)}</p>
                      <p className="text-[10px] text-muted-foreground">{entry.action_count} actions</p>
                    </div>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {Object.entries(entry.actions)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 3)
                        .map(([action, count]) => (
                          <Badge key={action} variant="outline" className="text-[9px] py-0">
                            {action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace("Payment ", "Pay ").replace("Submitted", "Sub")} ({count})
                          </Badge>
                        ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
