"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import { Users, IndianRupee, CheckCircle, Clock, Search, ChevronDown, ChevronUp, Trophy, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

interface MemberStatus {
  id: string;
  name: string;
  occupation: string;
  status: string;
  amount: number;
  paid_at: string | null;
  official_type: string | null;
}

interface District {
  district: string;
  totalMembers: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  collectedAmount: number;
  paymentRate: number;
  members: MemberStatus[];
}

interface Summary {
  totalMembers: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  totalCollected: number;
  overallRate: number;
}

export default function PaymentStatusPage() {
  const [districts, setDistricts] = useState<District[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topDistricts, setTopDistricts] = useState<{ district: string; rate: number; paid: number; total: number }[]>([]);
  const [period, setPeriod] = useState(new Date().getFullYear().toString());
  const [search, setSearch] = useState("");
  const [expandedDistrict, setExpandedDistrict] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const t = useT();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/subscriptions/payment-status?period=${period}`)
      .then((r) => r.json())
      .then((d) => {
        setDistricts(d.districts || []);
        setPeriods(d.periods || []);
        setSummary(d.summary || null);
        setTopDistricts(d.topDistricts || []);
      })
      .catch(() => toast.error("Failed to load payment status"))
      .finally(() => setLoading(false));
  }, [period]);

  const filteredDistricts = useMemo(() => {
    if (!search) return districts;
    const q = search.toLowerCase();
    return districts
      .map((d) => ({
        ...d,
        members: d.members.filter((m) => m.name.toLowerCase().includes(q) || m.occupation.toLowerCase().includes(q)),
      }))
      .filter((d) => d.members.length > 0 || d.district.toLowerCase().includes(q));
  }, [districts, search]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("payment_status.title")}</h1>
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("payment_status.title")}</h1>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label={t("payment_status.total_members")} value={summary.totalMembers} icon={Users} borderColor="border-l-primary" iconColor="text-primary/40" />
          <MetricCard label={t("payment_status.paid")} value={summary.paidCount} subtitle={`${summary.overallRate}%`} icon={CheckCircle} borderColor="border-l-green-500" iconColor="text-green-500/40" subtitleColor="text-green-600" />
          <MetricCard label={t("payment_status.pending")} value={summary.pendingCount} icon={Clock} borderColor="border-l-amber-500" iconColor="text-amber-500/40" />
          <MetricCard label={t("payment_status.collected")} value={`Rs.${summary.totalCollected.toLocaleString()}`} icon={IndianRupee} borderColor="border-l-blue-500" iconColor="text-blue-500/40" />
        </div>
      )}

      {/* Top Districts */}
      {topDistricts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Trophy size={14} className="text-amber-500" /> {t("payment_status.top_districts")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topDistricts.map((d, i) => (
              <div key={d.district} className="flex items-center gap-3">
                <span className={`text-xs font-bold w-5 text-center ${i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                  {i + 1}
                </span>
                <span className="text-sm font-medium flex-1 truncate">{d.district}</span>
                <span className="text-xs text-muted-foreground">{d.paid}/{d.total}</span>
                <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${d.rate >= 80 ? "bg-green-500" : d.rate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${d.rate}%` }}
                  />
                </div>
                <span className={`text-xs font-semibold w-10 text-right ${d.rate >= 80 ? "text-green-600" : d.rate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                  {d.rate}%
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t("payment_status.search_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* District-wise Accordion */}
      {filteredDistricts.length === 0 ? (
        <EmptyState icon={MapPin} title="No districts found" />
      ) : (
        <div className="space-y-3">
          {filteredDistricts.map((d) => {
            const isExpanded = expandedDistrict === d.district;
            return (
              <Card key={d.district} className="overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedDistrict(isExpanded ? null : d.district)}
                >
                  <MapPin size={14} className="text-primary shrink-0" />
                  <span className="font-semibold text-sm flex-1">{d.district}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      <span className="text-green-600 font-semibold">{d.paidCount}</span>
                      <span className="text-muted-foreground mx-0.5">/</span>
                      <span>{d.totalMembers}</span>
                    </Badge>
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden hidden sm:block">
                      <div
                        className={`h-full rounded-full ${d.paymentRate >= 80 ? "bg-green-500" : d.paymentRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${d.paymentRate}%` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold w-10 text-right ${d.paymentRate >= 80 ? "text-green-600" : d.paymentRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                      {d.paymentRate}%
                    </span>
                    {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t px-4 py-2">
                    <div className="divide-y">
                      {d.members.map((m) => (
                        <div key={m.id} className="flex items-center gap-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate uppercase">{m.name || "Unnamed"}</p>
                            <p className="text-xs text-muted-foreground">{m.occupation || "—"}</p>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            {m.paid_at && m.status === "paid" && (
                              <span className="text-[10px] text-muted-foreground hidden sm:block">
                                {new Date(m.paid_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                              </span>
                            )}
                            <StatusBadge status={m.status === "none" ? "pending" : m.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
