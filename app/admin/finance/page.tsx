"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import {
  Landmark,
  IndianRupee,
  Download,
  Search,
  Calendar,
  MapPin,
  FileText,
  Loader2,
  ChevronDown,
  ChevronRight,
  Link2,
} from "lucide-react";
import { FinanceOtpGate } from "@/components/finance-otp-gate";

interface LinkedMember {
  name: string;
  period: string;
  amount: number;
  district: string;
}

interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  member_name: string;
  member_phone: string;
  district: string;
  period: string;
  credit: number;
  debit: number;
  balance: number;
  payment_method: string;
  transaction_id: string;
  remarks: string;
  payment_group_id: string | null;
  linked_members: LinkedMember[];
}

interface PeriodSummary {
  period: string;
  count: number;
  total: number;
}

interface DistrictSummary {
  district: string;
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

export default function FinancePage() {
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState("2025-26");
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [totalCredits, setTotalCredits] = useState(0);
  const [totalSubscriptions, setTotalSubscriptions] = useState(0);
  const [totalBankEntries, setTotalBankEntries] = useState(0);
  const [byPeriod, setByPeriod] = useState<PeriodSummary[]>([]);
  const [byDistrict, setByDistrict] = useState<DistrictSummary[]>([]);
  const [byMonth, setByMonth] = useState<MonthSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance?year=${year}`);
      const data = await res.json();
      if (res.ok) {
        setLedger(data.ledger || []);
        setTotalCredits(data.totalCredits || 0);
        setTotalSubscriptions(data.totalSubscriptions || 0);
        setTotalBankEntries(data.totalBankEntries || 0);
        setByPeriod(data.byPeriod || []);
        setByDistrict(data.byDistrict || []);
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

  // Filtered ledger
  const filtered = ledger.filter((e) => {
    const q = searchQuery.trim().toLowerCase();
    const linkedMatch = e.linked_members?.some((m) => m.name.toLowerCase().includes(q));
    const matchesSearch = !q || e.member_name.toLowerCase().includes(q) || e.member_phone.includes(q) || e.transaction_id.toLowerCase().includes(q) || linkedMatch;
    const matchesDistrict = filterDistrict === "all" || e.district === filterDistrict || e.linked_members?.some((m) => m.district === filterDistrict);
    const matchesPeriod = filterPeriod === "all" || e.period.includes(filterPeriod) || e.linked_members?.some((m) => m.period === filterPeriod);
    return matchesSearch && matchesDistrict && matchesPeriod;
  });

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredTotal = filtered.reduce((sum, e) => sum + e.credit, 0);

  // Districts list for filter
  const districts = [...new Set(ledger.map((e) => e.district))].sort();
  const periods = [...new Set(ledger.map((e) => e.period))].sort();

  // PDF Export
  async function exportPDF() {
    setExporting(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      // Header
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("TANHOWA Finance - Bank Reconciliation", 148, 15, { align: "center" });
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Financial Year: ${year} | Generated: ${new Date().toLocaleDateString("en-IN")}`, 148, 22, { align: "center" });

      // Summary
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`Total Collections: Rs.${totalCredits.toLocaleString("en-IN")} | Subscriptions: ${totalSubscriptions} | Bank Entries: ${totalBankEntries}`, 148, 30, { align: "center" });

      // Ledger table — expand grouped payments into main + detail rows
      const pdfRows: { cells: (string | number)[]; isDetail?: boolean }[] = [];
      filtered.forEach((e, i) => {
        const isGrouped = e.linked_members && e.linked_members.length > 1;
        pdfRows.push({
          cells: [
            i + 1,
            new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
            isGrouped ? `${e.member_name} [${e.linked_members.length} subs]` : e.member_name,
            e.district,
            e.period,
            e.credit.toLocaleString("en-IN"),
            e.balance.toLocaleString("en-IN"),
            e.transaction_id || "-",
          ],
        });
        if (isGrouped) {
          e.linked_members.forEach((m) => {
            pdfRows.push({
              cells: ["", "", `    ${m.name}`, m.district, m.period, m.amount.toLocaleString("en-IN"), "", ""],
              isDetail: true,
            });
          });
        }
      });

      autoTable(doc, {
        startY: 36,
        head: [["#", "Date", "Member", "District", "Period", "Credit (Rs.)", "Balance (Rs.)", "Txn ID"]],
        body: pdfRows.map((r) => r.cells),
        theme: "grid",
        headStyles: { fillColor: [45, 106, 79], fontSize: 8 },
        bodyStyles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 10 },
          5: { halign: "right" as const },
          6: { halign: "right" as const },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didParseCell: (data: any) => {
          if (data.section === "body" && pdfRows[data.row.index]?.isDetail) {
            data.cell.styles.fillColor = [235, 245, 255];
            data.cell.styles.textColor = [30, 64, 175];
            data.cell.styles.fontStyle = "normal";
          }
        },
        didDrawPage: (data: { pageNumber: number }) => {
          doc.setFontSize(7);
          doc.setTextColor(150);
          doc.text(`Page ${data.pageNumber}`, 280, 200, { align: "right" });
        },
      });

      // Period summary on new page
      doc.addPage();
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text("Summary by Subscription Period", 14, 15);

      autoTable(doc, {
        startY: 22,
        head: [["Period", "Transactions", "Total (Rs.)"]],
        body: byPeriod.map((p) => [p.period, p.count, p.total.toLocaleString("en-IN")]),
        theme: "grid",
        headStyles: { fillColor: [45, 106, 79], fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 1: { halign: "center" }, 2: { halign: "right" } },
      });

      // District summary
      const periodTableEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || 60;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Summary by District", 14, periodTableEnd + 12);

      autoTable(doc, {
        startY: periodTableEnd + 18,
        head: [["District", "Transactions", "Total (Rs.)"]],
        body: byDistrict.map((d) => [d.district, d.count, d.total.toLocaleString("en-IN")]),
        theme: "grid",
        headStyles: { fillColor: [45, 106, 79], fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 1: { halign: "center" }, 2: { halign: "right" } },
      });

      doc.save(`TANHOWA_Bank_Reconciliation_${year}.pdf`);
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <FinanceOtpGate>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">TANHOWA Finance</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Bank Reconciliation - FY {year}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" className="gap-1.5" onClick={exportPDF} disabled={exporting || ledger.length === 0}>
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export PDF
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => {
            if (ledger.length === 0) return;
            import("@/lib/export-xlsx").then(({ downloadXlsx }) => {
              const sheets = [
                { name: "Ledger", data: filtered.map((e) => ({ Date: e.date, Member: e.member_name, Phone: e.member_phone, District: e.district, Period: e.period, Credit: e.credit, "Payment Method": e.payment_method, "Transaction ID": e.transaction_id, Remarks: e.remarks })) },
                { name: "By Period", data: byPeriod.map((p) => ({ Period: p.period, Count: p.count, Total: p.total })) },
                { name: "By District", data: byDistrict.map((d) => ({ District: d.district, Count: d.count, Total: d.total })) },
              ];
              downloadXlsx(sheets, `Finance-${year}`);
            });
          }} disabled={ledger.length === 0}>
            <FileText size={14} />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Collections" value={`Rs.${totalCredits.toLocaleString("en-IN")}`} icon={IndianRupee} borderColor="border-l-green-500" iconColor="text-green-500/40" subtitleColor="text-green-600" />
        <MetricCard label="Subscriptions" value={totalSubscriptions} subtitle={totalBankEntries !== totalSubscriptions ? `${totalBankEntries} bank entries` : undefined} icon={FileText} borderColor="border-l-blue-500" iconColor="text-blue-500/40" subtitleColor="text-blue-600" />
        <MetricCard label="Districts" value={districts.length} icon={MapPin} borderColor="border-l-purple-500" iconColor="text-purple-500/40" subtitleColor="text-purple-600" />
        <MetricCard label="Periods" value={periods.length} icon={Calendar} borderColor="border-l-amber-500" iconColor="text-amber-500/40" subtitleColor="text-amber-600" />
      </div>

      {/* Monthly Summary */}
      {byMonth.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Monthly Collections</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {byMonth.map((m) => (
                <div key={m.month} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30">
                  <span className="text-xs font-medium">{m.month}</span>
                  <Badge variant="outline" className="text-[10px]">{m.count}</Badge>
                  <span className="text-xs font-semibold text-green-700">Rs.{m.total.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Period + District Summary side by side */}
      <div className="grid md:grid-cols-2 gap-4">
        {byPeriod.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5"><Calendar size={14} /> By Period</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {byPeriod.map((p) => (
                <div key={p.period} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <div>
                    <span className="text-sm font-medium">{p.period}</span>
                    <span className="text-xs text-muted-foreground ml-2">{p.count} txns</span>
                  </div>
                  <span className="text-sm font-semibold text-green-700">Rs.{p.total.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {byDistrict.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5"><MapPin size={14} /> By District</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2 max-h-64 overflow-y-auto">
              {byDistrict.map((d) => (
                <div key={d.district} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <div>
                    <span className="text-sm font-medium">{d.district}</span>
                    <span className="text-xs text-muted-foreground ml-2">{d.count} txns</span>
                  </div>
                  <span className="text-sm font-semibold text-green-700">Rs.{d.total.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Ledger Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <FileText size={14} /> Transaction Ledger
              {filtered.length !== ledger.length && (
                <Badge variant="outline" className="text-[10px] ml-2">{filtered.length} of {ledger.length}</Badge>
              )}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search member, txn ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 w-40 text-xs" />
              </div>
              <Select value={filterDistrict} onValueChange={setFilterDistrict}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="All Districts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Districts</SelectItem>
                  {districts.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="All Periods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Periods</SelectItem>
                  {periods.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <EmptyState icon={Landmark} title="No transactions found" description={searchQuery ? "Try a different search" : `No paid subscriptions in FY ${year}`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-2 px-2 font-semibold w-6"></th>
                    <th className="text-left py-2 px-2 font-semibold">#</th>
                    <th className="text-left py-2 px-2 font-semibold">Date</th>
                    <th className="text-left py-2 px-2 font-semibold">Member</th>
                    <th className="text-left py-2 px-2 font-semibold">District</th>
                    <th className="text-left py-2 px-2 font-semibold">Period</th>
                    <th className="text-right py-2 px-2 font-semibold">Credit (Rs.)</th>
                    <th className="text-right py-2 px-2 font-semibold">Balance (Rs.)</th>
                    <th className="text-left py-2 px-2 font-semibold">Txn ID</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => {
                    const isGrouped = e.linked_members && e.linked_members.length > 1;
                    const isExpanded = expandedGroups.has(e.id);
                    return (
                      <>
                        <tr key={e.id} className={`border-b hover:bg-muted/30 transition-colors ${isGrouped ? "cursor-pointer" : ""}`} onClick={() => isGrouped && toggleGroup(e.id)}>
                          <td className="py-2 px-2">
                            {isGrouped && (
                              isExpanded ? <ChevronDown size={12} className="text-blue-600" /> : <ChevronRight size={12} className="text-blue-600" />
                            )}
                          </td>
                          <td className="py-2 px-2 text-muted-foreground">{i + 1}</td>
                          <td className="py-2 px-2 whitespace-nowrap">{new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                          <td className="py-2 px-2">
                            <span className="font-medium">{e.member_name}</span>
                            {e.member_phone && <span className="text-muted-foreground ml-1">({e.member_phone})</span>}
                            {isGrouped && (
                              <Badge variant="outline" className="ml-1.5 text-[9px] border-blue-300 text-blue-700 bg-blue-50">
                                <Link2 size={8} className="mr-0.5" />{e.linked_members.length} subs
                              </Badge>
                            )}
                          </td>
                          <td className="py-2 px-2">{e.district}</td>
                          <td className="py-2 px-2">{e.period}</td>
                          <td className="py-2 px-2 text-right font-medium text-green-700">{e.credit.toLocaleString("en-IN")}</td>
                          <td className="py-2 px-2 text-right font-medium">{e.balance.toLocaleString("en-IN")}</td>
                          <td className="py-2 px-2 text-muted-foreground">{e.transaction_id || "-"}</td>
                        </tr>
                        {isGrouped && isExpanded && e.linked_members.map((m, mi) => (
                          <tr key={`${e.id}-linked-${mi}`} className="bg-blue-50/50 border-b border-blue-100">
                            <td className="py-1.5 px-2"></td>
                            <td className="py-1.5 px-2"></td>
                            <td className="py-1.5 px-2"></td>
                            <td className="py-1.5 px-2 pl-6 text-blue-800">
                              <span className="font-medium">{m.name}</span>
                            </td>
                            <td className="py-1.5 px-2 text-blue-700">{m.district}</td>
                            <td className="py-1.5 px-2 text-blue-700">{m.period}</td>
                            <td className="py-1.5 px-2 text-right text-blue-700">Rs.{m.amount.toLocaleString("en-IN")}</td>
                            <td colSpan={2}></td>
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/50">
                    <td colSpan={6} className="py-2 px-2 font-semibold text-right">Total:</td>
                    <td className="py-2 px-2 text-right font-bold text-green-700">Rs.{filteredTotal.toLocaleString("en-IN")}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </FinanceOtpGate>
  );
}
