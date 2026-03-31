"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Download, FileText, IndianRupee, Users, CheckCircle, Clock, AlertTriangle, FileDown, BarChart3, ListTodo, Activity, TrendingUp, Lightbulb, MessageSquareWarning, Award } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DISTRICT_NAMES } from "@/lib/tn-districts";

// ---------------------------------------------------------------------------
// Overview Dashboard
// ---------------------------------------------------------------------------
interface OverviewData {
  members: { total: number; pending: number; activeThisWeek: number; newThisMonth: number };
  subscriptions: { totalCollected: number; collectionRate: number; byPeriod: { period: string; paid: number; pending: number; overdue: number; hold: number; rejected: number; collected: number; total: number }[] };
  tasks: { total: number; completionRate: number; breakdown: Record<string, number> };
  grievances: { total: number; suggestions: number; resolutionRate: number };
  contributions: { actionsThisMonth: number; minutesThisMonth: number };
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function OverviewTab() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports/overview")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!data) return <p className="text-center text-muted-foreground py-8">Failed to load overview.</p>;

  const taskStatusLabels: Record<string, string> = { pending: "Pending", approved: "Approved", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" };

  return (
    <div className="space-y-6">
      {/* Members */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2"><Users size={14} /> Members</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{data.members.total}</p><p className="text-xs text-muted-foreground">Total Approved</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-green-700">{data.members.activeThisWeek}</p><p className="text-xs text-muted-foreground">Active This Week</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-blue-700">{data.members.newThisMonth}</p><p className="text-xs text-muted-foreground">New This Month</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-amber-700">{data.members.pending}</p><p className="text-xs text-muted-foreground">Pending Approval</p></CardContent></Card>
        </div>
      </div>

      {/* Subscriptions / Collection */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2"><IndianRupee size={14} /> Collection</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">₹{data.subscriptions.totalCollected.toLocaleString("en-IN")}</p><p className="text-xs text-muted-foreground">Total Collected</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{data.subscriptions.collectionRate}%</p><p className="text-xs text-muted-foreground">Collection Rate</p></CardContent></Card>
        </div>
        {data.subscriptions.byPeriod.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Collection by Period</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center text-green-700">Paid</TableHead>
                    <TableHead className="text-center text-amber-700">Pending</TableHead>
                    <TableHead className="text-center text-red-700">Overdue</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.subscriptions.byPeriod.map((p) => (
                    <TableRow key={p.period}>
                      <TableCell className="font-medium">{p.period}</TableCell>
                      <TableCell className="text-center">{p.total}</TableCell>
                      <TableCell className="text-center text-green-700">{p.paid}</TableCell>
                      <TableCell className="text-center text-amber-700">{p.pending}</TableCell>
                      <TableCell className="text-center text-red-700">{p.overdue}</TableCell>
                      <TableCell className="text-right">₹{p.collected.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right">{p.total > 0 ? Math.round((p.paid / p.total) * 100) : 0}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tasks */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2"><ListTodo size={14} /> Tasks</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{data.tasks.total}</p><p className="text-xs text-muted-foreground">Total Tasks</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-green-700">{data.tasks.completionRate}%</p><p className="text-xs text-muted-foreground">Completion Rate</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{data.tasks.breakdown["in_progress"] || 0}</p><p className="text-xs text-muted-foreground">In Progress</p></CardContent></Card>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.tasks.breakdown).map(([status, count]) => (
            <Badge key={status} variant="outline" className="text-xs">
              {taskStatusLabels[status] || status}: {count}
            </Badge>
          ))}
        </div>
      </div>

      {/* Grievances & Suggestions */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2"><MessageSquareWarning size={14} /> Grievances & Suggestions</h3>
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{data.grievances.total}</p><p className="text-xs text-muted-foreground">Grievances</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{data.grievances.suggestions}</p><p className="text-xs text-muted-foreground">Suggestions</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-green-700">{data.grievances.resolutionRate}%</p><p className="text-xs text-muted-foreground">Resolved</p></CardContent></Card>
        </div>
      </div>

      {/* Contributions */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2"><Award size={14} /> Contributions (This Month)</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{data.contributions.actionsThisMonth}</p><p className="text-xs text-muted-foreground">Actions</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{formatMinutes(data.contributions.minutesThisMonth)}</p><p className="text-xs text-muted-foreground">Est. Time</p></CardContent></Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscriptions Report (existing)
// ---------------------------------------------------------------------------

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

export default function ReportsPage() {
  const [district, setDistrict] = useState("all");
  const [period, setPeriod] = useState("all");
  const [status, setStatus] = useState("all");
  const [periods, setPeriods] = useState<string[]>([]);
  const [members, setMembers] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, paid: 0, pending: 0, overdue: 0, totalAmount: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadReport();
  }, [district, period, status]);

  async function loadReport() {
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
  }

  const statusBadge = (s: string) => {
    switch (s) {
      case "paid": return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>;
      case "pending": return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>;
      case "overdue": return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Overdue</Badge>;
      default: return <Badge variant="outline">{s}</Badge>;
    }
  };

  // District-wise summary for state-wide view
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

  function downloadCSV() {
    if (members.length === 0) { toast.error("No data to download"); return; }
    const headers = ["Name", "Email", "Phone", "Designation", "District", "Block", "Period", "Amount", "Status", "Paid At", "Payment Method", "Transaction ID"];
    const rows = members.map((m) => [
      m.name, m.email, m.phone, m.occupation, m.district, m.block,
      m.period, m.amount, m.status, m.paid_at || "", m.payment_method || "", m.transaction_id || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const label = district === "all" ? "State" : district;
    const periodLabel = period === "all" ? "All-Periods" : period;
    a.download = `Subscriptions-${label}-${periodLabel}-${status}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPDF() {
    if (members.length === 0) { toast.error("No data to download"); return; }

    const doc = new jsPDF({ orientation: "landscape" });
    const label = district === "all" ? "State-wide" : district;
    const periodLabel = period === "all" ? "All Periods" : period;
    const statusLabel = status === "all" ? "All Status" : status.charAt(0).toUpperCase() + status.slice(1);
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    // Header
    doc.setFontSize(16);
    doc.text("TANHOWA - Subscription Report", 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`District: ${label}  |  Period: ${periodLabel}  |  Status: ${statusLabel}  |  Generated: ${today}`, 14, 22);

    // Summary line
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Total: ${summary.total}  |  Paid: ${summary.paid}  |  Pending: ${summary.pending}  |  Overdue: ${summary.overdue}  |  Collected: Rs.${summary.totalAmount.toLocaleString("en-IN")}`, 14, 29);

    let startY = 34;

    // District-wise summary table (if state-wide)
    if (district === "all" && districtSummary.length > 0) {
      autoTable(doc, {
        startY,
        head: [["District", "Total", "Paid", "Pending", "Overdue", "Amount"]],
        body: districtSummary.map((d) => [d.district, d.total, d.paid, d.pending, d.overdue, d.amount.toLocaleString("en-IN")]),
        theme: "grid",
        headStyles: { fillColor: [45, 106, 79], fontSize: 8 },
        bodyStyles: { fontSize: 7 },
        margin: { left: 14 },
      });
      startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }

    // Member details table
    autoTable(doc, {
      startY,
      head: [["#", "Name", "Phone", "District", "Block", "Period", "Amount", "Status", "Paid At"]],
      body: members.map((m, i) => [
        i + 1, m.name, m.phone || "", m.district, m.block || "", m.period,
        (m.amount || 0).toLocaleString("en-IN"), m.status,
        m.paid_at ? new Date(m.paid_at).toLocaleDateString("en-IN") : "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: [45, 106, 79], fontSize: 8 },
      bodyStyles: { fontSize: 7 },
      margin: { left: 14 },
      didParseCell(data) {
        if (data.section === "body" && data.column.index === 7) {
          const val = String(data.cell.raw);
          if (val === "paid") data.cell.styles.textColor = [22, 101, 52];
          else if (val === "pending") data.cell.styles.textColor = [161, 98, 7];
          else if (val === "overdue") data.cell.styles.textColor = [185, 28, 28];
        }
      },
    });

    const fileName = `Subscriptions-${label}-${periodLabel}-${statusLabel}.pdf`.replace(/\s+/g, "-");
    doc.save(fileName);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-1.5"><BarChart3 size={14} /> Overview</TabsTrigger>
          <TabsTrigger value="subscriptions" className="flex items-center gap-1.5"><IndianRupee size={14} /> Subscriptions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-4 space-y-6">
      <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={downloadPDF} disabled={members.length === 0}>
            <FileDown size={14} className="mr-2" />
            PDF
          </Button>
          <Button variant="outline" onClick={downloadCSV} disabled={members.length === 0}>
            <Download size={14} className="mr-2" />
            CSV
          </Button>
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <FileText className="w-8 h-8 text-primary/60" />
            <div>
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-green-500/60" />
            <div>
              <p className="text-2xl font-bold text-green-700">{summary.paid}</p>
              <p className="text-xs text-muted-foreground">Paid</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-500/60" />
            <div>
              <p className="text-2xl font-bold text-amber-700">{summary.pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-red-500/60" />
            <div>
              <p className="text-2xl font-bold text-red-700">{summary.overdue}</p>
              <p className="text-xs text-muted-foreground">Overdue</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <IndianRupee className="w-8 h-8 text-primary/60" />
            <div>
              <p className="text-2xl font-bold">{summary.totalAmount.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground">Collected</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading && <p className="text-center text-muted-foreground py-8">Loading report...</p>}

      {/* District-wise Summary (only when viewing all districts) */}
      {!loading && district === "all" && districtSummary.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">District-wise Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>District</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Paid</TableHead>
                    <TableHead className="text-center">Pending</TableHead>
                    <TableHead className="text-center">Overdue</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
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

      {/* Detailed Member Table */}
      {!loading && members.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users size={18} />
              Member Details
              <Badge variant="outline" className="ml-2">{members.length} records</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>District</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Paid At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.phone}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{m.district}{m.block ? ` / ${m.block}` : ""}</TableCell>
                      <TableCell className="text-sm">{m.period}</TableCell>
                      <TableCell className="text-right text-sm">{(m.amount || 0).toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-center">{statusBadge(m.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.paid_at ? new Date(m.paid_at).toLocaleDateString("en-IN") : "—"}
                      </TableCell>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
