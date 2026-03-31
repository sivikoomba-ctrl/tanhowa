"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Award, Clock, Activity, TrendingUp } from "lucide-react";

interface Contribution {
  id: string;
  action: string;
  description: string;
  estimated_minutes: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  payment_proof_uploaded:    { label: "Payment Proof", color: "bg-blue-100 text-blue-700 border-blue-300" },
  payment_verified:          { label: "Payment Verified", color: "bg-green-100 text-green-700 border-green-300" },
  payment_rejected:          { label: "Payment Rejected", color: "bg-red-100 text-red-700 border-red-300" },
  payment_hold:              { label: "Payment Hold", color: "bg-orange-100 text-orange-700 border-orange-300" },
  member_approved:           { label: "Member Approved", color: "bg-green-100 text-green-700 border-green-300" },
  member_rejected:           { label: "Member Rejected", color: "bg-red-100 text-red-700 border-red-300" },
  announcement_created:      { label: "Announcement", color: "bg-purple-100 text-purple-700 border-purple-300" },
  event_created:             { label: "Event", color: "bg-purple-100 text-purple-700 border-purple-300" },
  document_uploaded:         { label: "Document", color: "bg-blue-100 text-blue-700 border-blue-300" },
  suggestion_submitted:      { label: "Suggestion", color: "bg-amber-100 text-amber-700 border-amber-300" },
  grievance_submitted:       { label: "Grievance", color: "bg-amber-100 text-amber-700 border-amber-300" },
  grievance_responded:       { label: "Grievance Response", color: "bg-green-100 text-green-700 border-green-300" },
  task_created:              { label: "Task Created", color: "bg-blue-100 text-blue-700 border-blue-300" },
  task_committed:            { label: "Task Committed", color: "bg-green-100 text-green-700 border-green-300" },
  task_updated:              { label: "Task Updated", color: "bg-blue-100 text-blue-700 border-blue-300" },
  task_note_added:           { label: "Task Note", color: "bg-gray-100 text-gray-700 border-gray-300" },
  task_report_added:         { label: "Task Report", color: "bg-purple-100 text-purple-700 border-purple-300" },
  voucher_submitted:         { label: "Voucher", color: "bg-amber-100 text-amber-700 border-amber-300" },
  voucher_approved:          { label: "Voucher Approved", color: "bg-green-100 text-green-700 border-green-300" },
  voucher_rejected:          { label: "Voucher Rejected", color: "bg-red-100 text-red-700 border-red-300" },
  profile_updated:           { label: "Profile", color: "bg-gray-100 text-gray-700 border-gray-300" },
  expense_voucher_submitted: { label: "Expense Voucher", color: "bg-amber-100 text-amber-700 border-amber-300" },
};

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function ContributionsPage() {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/contributions?me=true&period=${period}`)
      .then((r) => r.json())
      .then((data) => {
        setContributions(data.contributions || []);
        setTotalMinutes(data.totalMinutes || 0);
      })
      .finally(() => setLoading(false));
  }, [period]);

  const actionCounts = contributions.reduce((acc, c) => {
    acc[c.action] = (acc[c.action] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topActions = Object.entries(actionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Contributions</h1>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Activity className="w-6 h-6 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{contributions.length}</p>
            <p className="text-xs text-muted-foreground">Actions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Clock className="w-6 h-6 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{formatMinutes(totalMinutes)}</p>
            <p className="text-xs text-muted-foreground">Est. Time</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Award className="w-6 h-6 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{Object.keys(actionCounts).length}</p>
            <p className="text-xs text-muted-foreground">Action Types</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Actions */}
      {topActions.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><TrendingUp size={14} /> Top Activities</h3>
            <div className="flex flex-wrap gap-2">
              {topActions.map(([action, count]) => {
                const config = ACTION_LABELS[action] || { label: action, color: "bg-gray-100 text-gray-700 border-gray-300" };
                return (
                  <Badge key={action} variant="outline" className={config.color}>
                    {config.label}: {count}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Feed */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : contributions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No contributions yet. Start using the portal to earn contributions!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {contributions.map((c) => {
            const config = ACTION_LABELS[c.action] || { label: c.action, color: "bg-gray-100 text-gray-700 border-gray-300" };
            return (
              <Card key={c.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={`${config.color} text-[10px] shrink-0`}>
                      {config.label}
                    </Badge>
                    <div>
                      <p className="text-sm">{c.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">+{c.estimated_minutes}m</span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
