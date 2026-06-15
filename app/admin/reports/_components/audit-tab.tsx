"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileDown, Sheet, TrendingUp, TrendingDown, Scale } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Statement {
  range: { from: string; to: string };
  income: { byPeriod: { period: string; count: number; amount: number }[]; total: number; count: number };
  expenditure: { byCategory: { category: string; count: number; amount: number }[]; total: number; count: number };
  net: number;
  receipts: { id: string; name: string; period: string; amount: number; paid_at: string; payment_method: string; transaction_id: string }[];
  payments: { id: string; title: string; category: string; amount: number; paid_to: string; approved_at: string; submitter: string }[];
}

// Build the list of selectable financial years (Apr–Mar), newest first.
function fyOptions(): { label: string; from: string; to: string }[] {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const out: { label: string; from: string; to: string }[] = [];
  for (let y = startYear; y >= startYear - 5; y--) {
    out.push({ label: `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`, from: `${y}-04-01`, to: `${y + 1}-04-01` });
  }
  return out;
}

const inr = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export function AuditTab() {
  const fys = fyOptions();
  const [fy, setFy] = useState(fys[0].label);
  const [data, setData] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);

  const selected = fys.find((f) => f.label === fy) || fys[0];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/financial-statement?from=${selected.from}&to=${selected.to}`);
      const d = await res.json();
      if (res.ok) setData(d);
      else toast.error(d.error || "Failed to load");
    } catch {
      toast.error("Failed to load statement");
    } finally {
      setLoading(false);
    }
  }, [selected.from, selected.to]);

  useEffect(() => { load(); }, [load]);

  function downloadPDF() {
    if (!data) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("TANHOWA - Income & Expenditure Statement", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`${fy}  (${fmtDate(data.range.from)} to ${fmtDate(new Date(new Date(data.range.to).getTime() - 86400000).toISOString())})`, 14, 23);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 30,
      head: [["INCOME (Receipts)", "Count", "Amount (Rs.)"]],
      body: data.income.byPeriod.map((i) => [i.period, i.count, i.amount.toLocaleString("en-IN")]),
      foot: [["Total Income", data.income.count, data.income.total.toLocaleString("en-IN")]],
      theme: "grid", headStyles: { fillColor: [22, 101, 52], fontSize: 9 }, footStyles: { fillColor: [220, 240, 225], textColor: 0, fontStyle: "bold" }, bodyStyles: { fontSize: 8 }, margin: { left: 14 },
    });
    let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: y,
      head: [["EXPENDITURE (Payments)", "Count", "Amount (Rs.)"]],
      body: data.expenditure.byCategory.map((e) => [e.category, e.count, e.amount.toLocaleString("en-IN")]),
      foot: [["Total Expenditure", data.expenditure.count, data.expenditure.total.toLocaleString("en-IN")]],
      theme: "grid", headStyles: { fillColor: [161, 98, 7], fontSize: 9 }, footStyles: { fillColor: [250, 240, 220], textColor: 0, fontStyle: "bold" }, bodyStyles: { fontSize: 8 }, margin: { left: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    const surplus = data.net >= 0;
    doc.setFontSize(12);
    doc.setTextColor(surplus ? 22 : 185, surplus ? 101 : 28, surplus ? 52 : 28);
    doc.text(`Net ${surplus ? "Surplus" : "Deficit"}: Rs. ${Math.abs(data.net).toLocaleString("en-IN")}`, 14, y);
    doc.save(`TANHOWA-IE-Statement-${fy.replace(/\s+/g, "-")}.pdf`);
  }

  function downloadExcel() {
    if (!data) return;
    downloadXlsx(
      [
        { name: "Income by Period", data: data.income.byPeriod.map((i) => ({ Period: i.period, Count: i.count, Amount: i.amount })) },
        { name: "Expenditure by Category", data: data.expenditure.byCategory.map((e) => ({ Category: e.category, Count: e.count, Amount: e.amount })) },
        { name: "Receipts Register", data: data.receipts.map((r) => ({ Member: r.name, Period: r.period, Amount: r.amount, "Paid On": r.paid_at, Method: r.payment_method, "Txn ID": r.transaction_id })) },
        { name: "Payments Register", data: data.payments.map((p) => ({ Title: p.title, Category: p.category, Amount: p.amount, "Paid To": p.paid_to, "Approved On": p.approved_at, "By": p.submitter })) },
      ],
      `TANHOWA-IE-Statement-${fy.replace(/\s+/g, "-")}`
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Select value={fy} onValueChange={setFy}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {fys.map((f) => <SelectItem key={f.label} value={f.label}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadPDF} disabled={!data}><FileDown size={14} className="mr-2" /> PDF</Button>
          <Button variant="outline" onClick={downloadExcel} disabled={!data}><Sheet size={14} className="mr-2" /> Excel</Button>
        </div>
      </div>

      {loading && <p className="text-center text-muted-foreground py-8">Loading statement…</p>}

      {!loading && data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card><CardContent className="pt-4 pb-4 flex items-center gap-3"><TrendingUp className="w-8 h-8 text-green-500/60" /><div><p className="text-2xl font-bold text-green-700">{inr(data.income.total)}</p><p className="text-xs text-muted-foreground">Total Income ({data.income.count})</p></div></CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 flex items-center gap-3"><TrendingDown className="w-8 h-8 text-amber-500/60" /><div><p className="text-2xl font-bold text-amber-700">{inr(data.expenditure.total)}</p><p className="text-xs text-muted-foreground">Total Expenditure ({data.expenditure.count})</p></div></CardContent></Card>
            <Card className={data.net >= 0 ? "border-green-300" : "border-red-300"}><CardContent className="pt-4 pb-4 flex items-center gap-3"><Scale className={`w-8 h-8 ${data.net >= 0 ? "text-green-500/60" : "text-red-500/60"}`} /><div><p className={`text-2xl font-bold ${data.net >= 0 ? "text-green-700" : "text-red-700"}`}>{inr(Math.abs(data.net))}</p><p className="text-xs text-muted-foreground">Net {data.net >= 0 ? "Surplus" : "Deficit"}</p></div></CardContent></Card>
          </div>

          {/* I&E statement tables */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base text-green-700">Income — Receipts</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Period</TableHead><TableHead className="text-center">Count</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.income.byPeriod.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No receipts in this year.</TableCell></TableRow>
                    ) : data.income.byPeriod.map((i) => (
                      <TableRow key={i.period}><TableCell className="font-medium">{i.period}</TableCell><TableCell className="text-center">{i.count}</TableCell><TableCell className="text-right">{inr(i.amount)}</TableCell></TableRow>
                    ))}
                    <TableRow className="font-semibold border-t-2 bg-muted/40"><TableCell>Total Income</TableCell><TableCell className="text-center">{data.income.count}</TableCell><TableCell className="text-right">{inr(data.income.total)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base text-amber-700">Expenditure — Payments</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-center">Count</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.expenditure.byCategory.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No approved vouchers in this year.</TableCell></TableRow>
                    ) : data.expenditure.byCategory.map((e) => (
                      <TableRow key={e.category}><TableCell className="font-medium">{e.category}</TableCell><TableCell className="text-center">{e.count}</TableCell><TableCell className="text-right">{inr(e.amount)}</TableCell></TableRow>
                    ))}
                    <TableRow className="font-semibold border-t-2 bg-muted/40"><TableCell>Total Expenditure</TableCell><TableCell className="text-center">{data.expenditure.count}</TableCell><TableCell className="text-right">{inr(data.expenditure.total)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Receipts register */}
          <Card>
            <CardHeader><CardTitle className="text-base">Receipts Register ({data.receipts.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-96">
                <Table>
                  <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Period</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Paid On</TableHead><TableHead>Method</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.receipts.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No receipts.</TableCell></TableRow>
                    ) : data.receipts.map((r) => (
                      <TableRow key={r.id}><TableCell className="text-sm">{r.name}</TableCell><TableCell className="text-sm">{r.period}</TableCell><TableCell className="text-right text-sm">{inr(r.amount)}</TableCell><TableCell className="text-sm text-muted-foreground">{fmtDate(r.paid_at)}</TableCell><TableCell className="text-sm text-muted-foreground">{r.payment_method || "—"}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Payments register */}
          <Card>
            <CardHeader><CardTitle className="text-base">Payments Register ({data.payments.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-96">
                <Table>
                  <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Paid To</TableHead><TableHead>Approved On</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.payments.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No payments.</TableCell></TableRow>
                    ) : data.payments.map((p) => (
                      <TableRow key={p.id}><TableCell className="text-sm font-medium">{p.title}</TableCell><TableCell className="text-sm">{p.category}</TableCell><TableCell className="text-right text-sm">{inr(p.amount)}</TableCell><TableCell className="text-sm text-muted-foreground">{p.paid_to || "—"}</TableCell><TableCell className="text-sm text-muted-foreground">{fmtDate(p.approved_at)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
