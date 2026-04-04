"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import { Landmark, IndianRupee, FileText, Calendar, MapPin } from "lucide-react";
import { useT } from "@/lib/i18n";

interface PeriodSummary {
  period: string;
  count: number;
  total: number;
}

interface MonthSummary {
  month: string;
  count: number;
  total: number;
}

const FY_OPTIONS = [
  { value: "2025-26", label: "2025-26" },
  { value: "2024-25", label: "2024-25" },
];

export default function MemberFinancePage() {
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState("2025-26");
  const t = useT();
  const [totalCredits, setTotalCredits] = useState(0);
  const [totalSubscriptions, setTotalSubscriptions] = useState(0);
  const [totalBankEntries, setTotalBankEntries] = useState(0);
  const [districtsCount, setDistrictsCount] = useState(0);
  const [byPeriod, setByPeriod] = useState<PeriodSummary[]>([]);
  const [byMonth, setByMonth] = useState<MonthSummary[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance?year=${year}`);
      const data = await res.json();
      if (res.ok) {
        setTotalCredits(data.totalCredits || 0);
        setTotalSubscriptions(data.totalSubscriptions || 0);
        setTotalBankEntries(data.totalBankEntries || 0);
        setDistrictsCount(data.districtsCount || 0);
        setByPeriod(data.byPeriod || []);
        setByMonth(data.byMonth || []);
      } else {
        toast.error(data.error || "Failed to load");
      }
    } catch {
      toast.error("Failed to load finance data");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">{t("finance.title")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">{t("finance.summary")} - FY {year}</p>
          </div>
        </div>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FY_OPTIONS.map((fy) => (
              <SelectItem key={fy.value} value={fy.value}>{fy.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard label={t("finance.total_collections")} value={`Rs.${totalCredits.toLocaleString("en-IN")}`} icon={IndianRupee} borderColor="border-l-green-500" iconColor="text-green-500/40" subtitleColor="text-green-600" />
        <MetricCard label={t("finance.subscriptions")} value={totalSubscriptions} subtitle={totalBankEntries !== totalSubscriptions ? `${totalBankEntries} ${t("finance.bank_entries")}` : undefined} icon={FileText} borderColor="border-l-blue-500" iconColor="text-blue-500/40" subtitleColor="text-blue-600" />
        <MetricCard label={t("finance.districts")} value={districtsCount} icon={MapPin} borderColor="border-l-purple-500" iconColor="text-purple-500/40" subtitleColor="text-purple-600" />
      </div>

      {totalSubscriptions === 0 ? (
        <EmptyState icon={Landmark} title={t("finance.no_data")} description={t("finance.no_paid_subs", { year })} />
      ) : (
        <>
          {/* Monthly Collections */}
          {byMonth.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Calendar size={14} /> {t("finance.monthly_collections")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {byMonth.map((m) => {
                    const pct = totalCredits > 0 ? Math.round((m.total / totalCredits) * 100) : 0;
                    return (
                      <div key={m.month} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{m.month}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{m.count} txns</Badge>
                            <span className="font-semibold text-green-700">Rs.{m.total.toLocaleString("en-IN")}</span>
                          </div>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* By Period */}
          {byPeriod.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <FileText size={14} /> {t("finance.by_period")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {byPeriod.map((p) => (
                  <div key={p.period} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <span className="text-sm font-medium">{p.period}</span>
                      <span className="text-xs text-muted-foreground ml-2">{p.count} {t("finance.payments")}</span>
                    </div>
                    <span className="text-sm font-semibold text-green-700">Rs.{p.total.toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Note */}
          <p className="text-xs text-muted-foreground text-center">
            {t("finance.summary_note")}
          </p>
        </>
      )}
    </div>
  );
}
