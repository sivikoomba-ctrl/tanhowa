"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Download, FileText, CheckCircle, Clock, FileDown, Receipt, XCircle } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Bar, BarChart, Cell, Legend, Pie, PieChart, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { expenseStatusConfig, CATEGORY_PALETTE, CHART_COLORS } from "@/lib/chart-config";

interface ExpenseRow {
  id: string;
  title: string;
  amount: number;
  category: string;
  status: string;
  expense_date: string | null;
  invoice_number: string;
  vendor_name: string;
  created_at: string;
  submitter_name: string;
  submitter_type: string;
}

interface CategoryBreakdown {
  category: string;
  count: number;
  approved: number;
  pending: number;
  rejected: number;
  approvedAmount: number;
  pendingAmount: number;
}

interface OfficialBreakdown {
  id: string;
  name: string;
  official_type: string;
  count: number;
  approved: number;
  pending: number;
  rejected: number;
  approvedAmount: number;
}

export function ExpensesTab() {
  const [vouchers, setVouchers] = useState<ExpenseRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, approved: 0, pending: 0, rejected: 0, totalAmount: 0, pendingAmount: 0 });
  const [byCategory, setByCategory] = useState<CategoryBreakdown[]>([]);
  const [byOfficial, setByOfficial] = useState<OfficialBreakdown[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [officials, setOfficials] = useState<{ id: string; name: string; official_type: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterOfficial, setFilterOfficial] = useState("all");

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCategory !== "all") params.set("category", filterCategory);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterOfficial !== "all") params.set("official", filterOfficial);
      const res = await fetch(`/api/reports/expenses?${params}`);
      const data = await res.json();
      if (res.ok) {
        setVouchers(data.vouchers || []);
        setSummary(data.summary || { total: 0, approved: 0, pending: 0, rejected: 0, totalAmount: 0, pendingAmount: 0 });
        setByCategory(data.byCategory || []);
        setByOfficial(data.byOfficial || []);
        setCategories(data.categories || []);
        setOfficials(data.officials || []);
      }
    } catch {
      toast.error("Failed to load expense report");
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterStatus, filterOfficial]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  function downloadExpensePDF() {
    if (vouchers.length === 0) { toast.error("No data to download"); return; }
    const doc = new jsPDF({ orientation: "landscape" });
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const catLabel = filterCategory === "all" ? "All Categories" : filterCategory;
    const statusLabel = filterStatus === "all" ? "All Status" : filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1);

    doc.setFontSize(16);
    doc.text("TANHOWA - Expense Vouchers Report", 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Category: ${catLabel}  |  Status: ${statusLabel}  |  Generated: ${today}`, 14, 22);
    doc.setTextColor(0);
    doc.text(`Total: ${summary.total}  |  Approved: ${summary.approved} (Rs.${summary.totalAmount.toLocaleString("en-IN")})  |  Pending: ${summary.pending} (Rs.${summary.pendingAmount.toLocaleString("en-IN")})  |  Rejected: ${summary.rejected}`, 14, 29);

    let startY = 34;
    if (byCategory.length > 1) {
      autoTable(doc, {
        startY,
        head: [["Category", "Total", "Approved", "Pending", "Rejected", "Approved Amt", "Pending Amt"]],
        body: byCategory.map((c) => [c.category, c.count, c.approved, c.pending, c.rejected, c.approvedAmount.toLocaleString("en-IN"), c.pendingAmount.toLocaleString("en-IN")]),
        theme: "grid", headStyles: { fillColor: [45, 106, 79], fontSize: 8 }, bodyStyles: { fontSize: 7 }, margin: { left: 14 },
      });
      startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
    if (byOfficial.length > 1) {
      autoTable(doc, {
        startY,
        head: [["Official", "Type", "Total", "Approved", "Pending", "Rejected", "Approved Amt"]],
        body: byOfficial.map((o) => [o.name, o.official_type === "state" ? "State" : "District", o.count, o.approved, o.pending, o.rejected, o.approvedAmount.toLocaleString("en-IN")]),
        theme: "grid", headStyles: { fillColor: [45, 106, 79], fontSize: 8 }, bodyStyles: { fontSize: 7 }, margin: { left: 14 },
      });
      startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
    autoTable(doc, {
      startY,
      head: [["#", "Title", "Official", "Category", "Vendor", "Invoice", "Amount", "Status", "Date"]],
      body: vouchers.map((v, i) => [i + 1, v.title, v.submitter_name, v.category || "—", v.vendor_name || "—", v.invoice_number || "—", (v.amount || 0).toLocaleString("en-IN"), v.status, v.expense_date ? new Date(v.expense_date).toLocaleDateString("en-IN") : "—"]),
      theme: "grid", headStyles: { fillColor: [45, 106, 79], fontSize: 8 }, bodyStyles: { fontSize: 7 }, margin: { left: 14 },
      didParseCell(data) {
        if (data.section === "body" && data.column.index === 7) {
          const val = String(data.cell.raw);
          if (val === "approved") data.cell.styles.textColor = [22, 101, 52];
          else if (val === "pending") data.cell.styles.textColor = [161, 98, 7];
          else if (val === "rejected") data.cell.styles.textColor = [185, 28, 28];
        }
      },
    });
    doc.save(`Expenses-${catLabel}-${statusLabel}.pdf`.replace(/\s+/g, "-"));
  }

  function downloadExpenseCSV() {
    if (vouchers.length === 0) { toast.error("No data to download"); return; }
    const headers = ["Title", "Official", "Type", "Category", "Vendor", "Invoice", "Amount", "Status", "Expense Date", "Created At"];
    const rows = vouchers.map((v) => [v.title, v.submitter_name, v.submitter_type, v.category, v.vendor_name, v.invoice_number, v.amount, v.status, v.expense_date || "", v.created_at]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "Expenses-Report.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const expenseStatusBadge = (s: string) => {
    switch (s) {
      case "approved": return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>;
      case "pending": return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>;
      case "rejected": return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Rejected</Badge>;
      default: return <Badge variant="outline">{s}</Badge>;
    }
  };

  // Chart data
  const categoryPieData = byCategory.map((c, i) => ({
    name: c.category,
    value: c.approvedAmount,
    fill: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
  })).filter((d) => d.value > 0);

  const statusBarData = [
    { name: "Approved", value: summary.totalAmount, fill: CHART_COLORS.approved },
    { name: "Pending", value: summary.pendingAmount, fill: CHART_COLORS.pending },
  ];

  const categoryChartConfig = Object.fromEntries(
    byCategory.map((c, i) => [c.category, { label: c.category, color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] }])
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={downloadExpensePDF} disabled={vouchers.length === 0}><FileDown size={14} className="mr-2" /> PDF</Button>
        <Button variant="outline" onClick={downloadExpenseCSV} disabled={vouchers.length === 0}><Download size={14} className="mr-2" /> CSV</Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Category</label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Official</label>
              <Select value={filterOfficial} onValueChange={setFilterOfficial}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Officials</SelectItem>
                  {officials.map((o) => <SelectItem key={o.id} value={o.id}>{o.name} ({o.official_type})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3"><FileText className="w-8 h-8 text-primary/60" /><div><p className="text-2xl font-bold">{summary.total}</p><p className="text-xs text-muted-foreground">Total Vouchers</p></div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3"><CheckCircle className="w-8 h-8 text-green-500/60" /><div><p className="text-2xl font-bold text-green-700">₹{summary.totalAmount.toLocaleString("en-IN")}</p><p className="text-xs text-muted-foreground">Approved ({summary.approved})</p></div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3"><Clock className="w-8 h-8 text-amber-500/60" /><div><p className="text-2xl font-bold text-amber-700">₹{summary.pendingAmount.toLocaleString("en-IN")}</p><p className="text-xs text-muted-foreground">Pending ({summary.pending})</p></div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3"><XCircle className="w-8 h-8 text-red-500/60" /><div><p className="text-2xl font-bold text-red-700">{summary.rejected}</p><p className="text-xs text-muted-foreground">Rejected</p></div></CardContent></Card>
      </div>

      {/* Charts Row */}
      {!loading && (categoryPieData.length > 0 || statusBarData.some((d) => d.value > 0)) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categoryPieData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Approved Amount by Category</CardTitle></CardHeader>
              <CardContent>
                <ChartContainer config={categoryChartConfig} className="h-[240px] w-full">
                  <PieChart>
                    <Pie data={categoryPieData} dataKey="value" nameKey="name" outerRadius={80} strokeWidth={2} stroke="#fff">
                      {categoryPieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => `₹${Number(value).toLocaleString("en-IN")}`} />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
          {statusBarData.some((d) => d.value > 0) && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Expense Status Summary</CardTitle></CardHeader>
              <CardContent>
                <ChartContainer config={expenseStatusConfig} className="h-[240px] w-full">
                  <BarChart data={statusBarData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {statusBarData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => `₹${Number(value).toLocaleString("en-IN")}`} />} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {loading && <p className="text-center text-muted-foreground py-8">Loading expense report...</p>}

      {/* Category Breakdown Table */}
      {!loading && byCategory.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">By Category</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Category</TableHead><TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center text-green-700">Approved</TableHead><TableHead className="text-center text-amber-700">Pending</TableHead>
                  <TableHead className="text-center text-red-700">Rejected</TableHead><TableHead className="text-right">Approved Amt</TableHead><TableHead className="text-right">Pending Amt</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {byCategory.map((c) => (
                    <TableRow key={c.category} className="cursor-pointer hover:bg-muted/50" onClick={() => setFilterCategory(c.category)}>
                      <TableCell className="font-medium">{c.category}</TableCell>
                      <TableCell className="text-center">{c.count}</TableCell>
                      <TableCell className="text-center text-green-700">{c.approved}</TableCell>
                      <TableCell className="text-center text-amber-700">{c.pending}</TableCell>
                      <TableCell className="text-center text-red-700">{c.rejected}</TableCell>
                      <TableCell className="text-right font-medium">₹{c.approvedAmount.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right text-muted-foreground">₹{c.pendingAmount.toLocaleString("en-IN")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Official Breakdown Table */}
      {!loading && byOfficial.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">By Official</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Official</TableHead><TableHead>Type</TableHead><TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center text-green-700">Approved</TableHead><TableHead className="text-center text-amber-700">Pending</TableHead>
                  <TableHead className="text-center text-red-700">Rejected</TableHead><TableHead className="text-right">Approved Amt</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {byOfficial.map((o) => (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setFilterOfficial(o.id)}>
                      <TableCell className="font-medium">{o.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={o.official_type === "state" ? "bg-purple-50 text-purple-700 border-purple-300 text-[10px]" : "bg-blue-50 text-blue-700 border-blue-300 text-[10px]"}>
                          {o.official_type === "state" ? "State" : "District"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{o.count}</TableCell>
                      <TableCell className="text-center text-green-700">{o.approved}</TableCell>
                      <TableCell className="text-center text-amber-700">{o.pending}</TableCell>
                      <TableCell className="text-center text-red-700">{o.rejected}</TableCell>
                      <TableCell className="text-right font-medium">₹{o.approvedAmount.toLocaleString("en-IN")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Voucher Details */}
      {!loading && vouchers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt size={18} /> Voucher Details
              <Badge variant="outline" className="ml-2">{vouchers.length} records</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Title</TableHead><TableHead>Official</TableHead><TableHead>Category</TableHead><TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead><TableHead className="text-center">Status</TableHead><TableHead>Date</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {vouchers.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell><div><p className="font-medium text-sm">{v.title}</p>{v.invoice_number && <p className="text-xs text-muted-foreground">Invoice: {v.invoice_number}</p>}</div></TableCell>
                      <TableCell className="text-sm">{v.submitter_name}</TableCell>
                      <TableCell className="text-sm">{v.category || "—"}</TableCell>
                      <TableCell className="text-sm">{v.vendor_name || "—"}</TableCell>
                      <TableCell className="text-right text-sm">₹{(v.amount || 0).toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-center">{expenseStatusBadge(v.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{v.expense_date ? new Date(v.expense_date).toLocaleDateString("en-IN") : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && vouchers.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No expense vouchers found for the selected filters.</p>
      )}
    </div>
  );
}
