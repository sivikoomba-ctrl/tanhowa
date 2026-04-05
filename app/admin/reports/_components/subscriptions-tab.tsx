"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Download, FileText, CheckCircle, Clock, AlertTriangle, FileDown, IndianRupee, Users, Sheet } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DISTRICT_NAMES } from "@/lib/tn-districts";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { CHART_COLORS } from "@/lib/chart-config";

interface ReportRow {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  occupation: string;
  district: string;
  block: string;
  period: string;
  amount: number;
  status: string;
  paid_at: string | null;
  payment_method: string;
  transaction_id: string;
}

interface Summary {
  total: number;
  paid: number;
  pending: number;
  overdue: number;
  totalAmount: number;
}

export function SubscriptionsTab() {
  const [district, setDistrict] = useState("all");
  const [period, setPeriod] = useState("all");
  const [status, setStatus] = useState("all");
  const [periods, setPeriods] = useState<string[]>([]);
  const [members, setMembers] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, paid: 0, pending: 0, overdue: 0, totalAmount: 0 });
  const [loading, setLoading] = useState(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (district !== "all") params.set("district", district);
      if (period !== "all") params.set("period", period);
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/reports/subscriptions?${params}`);
      const data = await res.json();
      if (res.ok) {
        setMembers(data.members || []);
        setPeriods(data.periods || []);
        setSummary(data.summary || { total: 0, paid: 0, pending: 0, overdue: 0, totalAmount: 0 });
      } else {
        toast.error(data.error || "Failed to load report");
      }
    } catch {
      toast.error("Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [district, period, status]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const statusBadge = (s: string) => {
    switch (s) {
      case "paid": return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>;
      case "pending": return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>;
      case "overdue": return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Overdue</Badge>;
      default: return <Badge variant="outline">{s}</Badge>;
    }
  };

  const districtSummary = useMemo(() => {
    if (district !== "all") return [];
    const map = new Map<string, { district: string; total: number; paid: number; pending: number; overdue: number; amount: number }>();
    for (const m of members) {
      const d = m.district || "Unassigned";
      if (!map.has(d)) map.set(d, { district: d, total: 0, paid: 0, pending: 0, overdue: 0, amount: 0 });
      const row = map.get(d)!;
      row.total++;
      if (m.status === "paid") { row.paid++; row.amount += m.amount || 0; }
      else if (m.status === "pending") row.pending++;
      else if (m.status === "overdue") row.overdue++;
    }
    return Array.from(map.values()).sort((a, b) => a.district === "Unassigned" ? 1 : b.district === "Unassigned" ? -1 : a.district.localeCompare(b.district));
  }, [members, district]);

  // Chart data: top districts by paid amount
  const districtChartData = useMemo(() => {
    return districtSummary
      .filter((d) => d.district !== "Unassigned")
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15)
      .map((d) => ({
        name: d.district.length > 12 ? d.district.slice(0, 11) + "…" : d.district,
        fullName: d.district,
        paid: d.paid,
        pending: d.pending + d.overdue,
        amount: d.amount,
      }));
  }, [districtSummary]);

  function downloadCSV() {
    if (members.length === 0) { toast.error("No data to download"); return; }
    const headers = ["Name", "Email", "Phone", "Designation", "District", "Block", "Period", "Amount", "Status", "Paid At", "Payment Method", "Transaction ID"];
    const rows = members.map((m) => [m.name, m.email, m.phone, m.occupation, m.district, m.block, m.period, m.amount, m.status, m.paid_at || "", m.payment_method || "", m.transaction_id || ""]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const label = district === "all" ? "State" : district;
    const periodLabel = period === "all" ? "All-Periods" : period;
    a.href = url; a.download = `Subscriptions-${label}-${periodLabel}-${status}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPDF() {
    if (members.length === 0) { toast.error("No data to download"); return; }
    const doc = new jsPDF({ orientation: "landscape" });
    const label = district === "all" ? "State-wide" : district;
    const periodLabel = period === "all" ? "All Periods" : period;
    const statusLabel = status === "all" ? "All Status" : status.charAt(0).toUpperCase() + status.slice(1);
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    doc.setFontSize(16); doc.text("TANHOWA - Subscription Report", 14, 15);
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`District: ${label}  |  Period: ${periodLabel}  |  Status: ${statusLabel}  |  Generated: ${today}`, 14, 22);
    doc.setFontSize(10); doc.setTextColor(0);
    doc.text(`Total: ${summary.total}  |  Paid: ${summary.paid}  |  Pending: ${summary.pending}  |  Overdue: ${summary.overdue}  |  Collected: Rs.${summary.totalAmount.toLocaleString("en-IN")}`, 14, 29);

    let startY = 34;
    if (district === "all" && districtSummary.length > 0) {
      autoTable(doc, {
        startY,
        head: [["District", "Total", "Paid", "Pending", "Overdue", "Amount"]],
        body: districtSummary.map((d) => [d.district, d.total, d.paid, d.pending, d.overdue, d.amount.toLocaleString("en-IN")]),
        theme: "grid", headStyles: { fillColor: [45, 106, 79], fontSize: 8 }, bodyStyles: { fontSize: 7 }, margin: { left: 14 },
      });
      startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
    autoTable(doc, {
      startY,
      head: [["#", "Name", "Phone", "District", "Block", "Period", "Amount", "Status", "Paid At"]],
      body: members.map((m, i) => [i + 1, m.name, m.phone || "", m.district, m.block || "", m.period, (m.amount || 0).toLocaleString("en-IN"), m.status, m.paid_at ? new Date(m.paid_at).toLocaleDateString("en-IN") : "—"]),
      theme: "grid", headStyles: { fillColor: [45, 106, 79], fontSize: 8 }, bodyStyles: { fontSize: 7 }, margin: { left: 14 },
      didParseCell(data) {
        if (data.section === "body" && data.column.index === 7) {
          const val = String(data.cell.raw);
          if (val === "paid") data.cell.styles.textColor = [22, 101, 52];
          else if (val === "pending") data.cell.styles.textColor = [161, 98, 7];
          else if (val === "overdue") data.cell.styles.textColor = [185, 28, 28];
        }
      },
    });
    doc.save(`Subscriptions-${label}-${periodLabel}-${statusLabel}.pdf`.replace(/\s+/g, "-"));
  }

  const districtChartConfig = { paid: { label: "Paid", color: CHART_COLORS.paid }, pending: { label: "Pending/Overdue", color: CHART_COLORS.pending } };

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={downloadPDF} disabled={members.length === 0}><FileDown size={14} className="mr-2" /> PDF</Button>
        <Button variant="outline" onClick={downloadCSV} disabled={members.length === 0}><Download size={14} className="mr-2" /> CSV</Button>
        <Button variant="outline" onClick={() => {
          if (members.length === 0) { toast.error("No data"); return; }
          const label = district === "all" ? "State" : district;
          const sheets = [];
          if (districtSummary.length > 0) {
            sheets.push({ name: "District Summary", data: districtSummary.map((d) => ({ District: d.district, Total: d.total, Paid: d.paid, Pending: d.pending, Overdue: d.overdue, Amount: d.amount })) });
          }
          sheets.push({ name: "Members", data: members.map((m) => ({ Name: m.name, Email: m.email, Phone: m.phone, Designation: m.occupation, District: m.district, Block: m.block, Period: m.period, Amount: m.amount, Status: m.status, "Paid At": m.paid_at || "", "Payment Method": m.payment_method || "", "Transaction ID": m.transaction_id || "" })) });
          downloadXlsx(sheets, `Subscriptions-${label}-${period === "all" ? "All" : period}`);
        }} disabled={members.length === 0}><Sheet size={14} className="mr-2" /> Excel</Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">District</label>
              <Select value={district} onValueChange={setDistrict}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Districts (State-wide)</SelectItem>
                  {DISTRICT_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Period</label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Periods</SelectItem>
                  {periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <Card><CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4 flex items-center gap-2 sm:gap-3"><FileText className="w-6 h-6 sm:w-8 sm:h-8 text-primary/60 shrink-0" /><div><p className="text-xl sm:text-2xl font-bold">{summary.total}</p><p className="text-[10px] sm:text-xs text-muted-foreground">Total</p></div></CardContent></Card>
        <Card><CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4 flex items-center gap-2 sm:gap-3"><CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-green-500/60 shrink-0" /><div><p className="text-xl sm:text-2xl font-bold text-green-700">{summary.paid}</p><p className="text-[10px] sm:text-xs text-muted-foreground">Paid</p></div></CardContent></Card>
        <Card><CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4 flex items-center gap-2 sm:gap-3"><Clock className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500/60 shrink-0" /><div><p className="text-xl sm:text-2xl font-bold text-amber-700">{summary.pending}</p><p className="text-[10px] sm:text-xs text-muted-foreground">Pending</p></div></CardContent></Card>
        <Card><CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4 flex items-center gap-2 sm:gap-3"><AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-red-500/60 shrink-0" /><div><p className="text-xl sm:text-2xl font-bold text-red-700">{summary.overdue}</p><p className="text-[10px] sm:text-xs text-muted-foreground">Overdue</p></div></CardContent></Card>
        <Card className="col-span-2 sm:col-span-1"><CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4 flex items-center gap-2 sm:gap-3"><IndianRupee className="w-6 h-6 sm:w-8 sm:h-8 text-primary/60 shrink-0" /><div><p className="text-xl sm:text-2xl font-bold">{summary.totalAmount.toLocaleString("en-IN")}</p><p className="text-[10px] sm:text-xs text-muted-foreground">Collected</p></div></CardContent></Card>
      </div>

      {loading && <p className="text-center text-muted-foreground py-8">Loading report...</p>}

      {/* District Collection Bar Chart (only state-wide) */}
      {!loading && district === "all" && districtChartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">District Collection Comparison</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={districtChartConfig} className="h-[320px] w-full">
              <BarChart data={districtChartData} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="paid" stackId="a" fill={CHART_COLORS.paid} name="Paid" />
                <Bar dataKey="pending" stackId="a" fill={CHART_COLORS.pending} name="Pending/Overdue" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* District-wise Summary Table */}
      {!loading && district === "all" && districtSummary.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">District-wise Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>District</TableHead><TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Paid</TableHead><TableHead className="text-center">Pending</TableHead>
                  <TableHead className="text-center">Overdue</TableHead><TableHead className="text-right">Amount</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {districtSummary.map((d) => (
                    <TableRow key={d.district} className="cursor-pointer hover:bg-muted/50" onClick={() => setDistrict(d.district === "Unassigned" ? "all" : d.district)}>
                      <TableCell className="font-medium">{d.district}</TableCell>
                      <TableCell className="text-center">{d.total}</TableCell>
                      <TableCell className="text-center text-green-700">{d.paid}</TableCell>
                      <TableCell className="text-center text-amber-700">{d.pending}</TableCell>
                      <TableCell className="text-center text-red-700">{d.overdue}</TableCell>
                      <TableCell className="text-right font-medium">{d.amount.toLocaleString("en-IN")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Member Details */}
      {!loading && members.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Users size={18} /> Member Details <Badge variant="outline" className="ml-2">{members.length} records</Badge></CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>District</TableHead><TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount</TableHead><TableHead className="text-center">Status</TableHead><TableHead>Paid At</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell><div><p className="font-medium text-sm">{m.name}</p><p className="text-xs text-muted-foreground">{m.phone}</p></div></TableCell>
                      <TableCell className="text-sm">{m.district}{m.block ? ` / ${m.block}` : ""}</TableCell>
                      <TableCell className="text-sm">{m.period}</TableCell>
                      <TableCell className="text-right text-sm">{(m.amount || 0).toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-center">{statusBadge(m.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.paid_at ? new Date(m.paid_at).toLocaleDateString("en-IN") : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && members.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No subscription records found for the selected filters.</p>
      )}
    </div>
  );
}
