import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await isAdmin(session))) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const status = url.searchParams.get("status");
    const official = url.searchParams.get("official");

    let query = supabase
      .from("expense_vouchers")
      .select("*, submitter:submitted_by(id, name, email, phone, official_type)")
      .order("created_at", { ascending: false });

    if (category && category !== "all") {
      query = query.eq("category", category);
    }
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (official && official !== "all") {
      query = query.eq("submitted_by", official);
    }

    const { data: vouchers, error } = await query;

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/reports/expenses", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch expense report" }, { status: 500 });
    }

    const rows = vouchers || [];

    // Compute summary
    const total = rows.length;
    const approved = rows.filter((v) => v.status === "approved").length;
    const pending = rows.filter((v) => v.status === "pending").length;
    const rejected = rows.filter((v) => v.status === "rejected").length;
    const totalAmount = rows.filter((v) => v.status === "approved").reduce((s, v) => s + (v.amount || 0), 0);
    const pendingAmount = rows.filter((v) => v.status === "pending").reduce((s, v) => s + (v.amount || 0), 0);

    // Unique categories and officials for filter dropdowns
    const categories = [...new Set(rows.map((v) => v.category).filter(Boolean))].sort();
    const officials = [...new Map(rows.filter((v) => v.submitter).map((v) => [v.submitter.id, { id: v.submitter.id, name: v.submitter.name, official_type: v.submitter.official_type }])).values()];

    // By-category breakdown
    const byCategory: Record<string, { category: string; count: number; approved: number; pending: number; rejected: number; approvedAmount: number; pendingAmount: number }> = {};
    for (const v of rows) {
      const cat = v.category || "Uncategorized";
      if (!byCategory[cat]) byCategory[cat] = { category: cat, count: 0, approved: 0, pending: 0, rejected: 0, approvedAmount: 0, pendingAmount: 0 };
      byCategory[cat].count++;
      if (v.status === "approved") { byCategory[cat].approved++; byCategory[cat].approvedAmount += v.amount || 0; }
      else if (v.status === "pending") { byCategory[cat].pending++; byCategory[cat].pendingAmount += v.amount || 0; }
      else if (v.status === "rejected") byCategory[cat].rejected++;
    }

    // By-official breakdown
    const byOfficial: Record<string, { id: string; name: string; official_type: string; count: number; approved: number; pending: number; rejected: number; approvedAmount: number }> = {};
    for (const v of rows) {
      const sub = v.submitter;
      if (!sub) continue;
      if (!byOfficial[sub.id]) byOfficial[sub.id] = { id: sub.id, name: sub.name, official_type: sub.official_type || "", count: 0, approved: 0, pending: 0, rejected: 0, approvedAmount: 0 };
      byOfficial[sub.id].count++;
      if (v.status === "approved") { byOfficial[sub.id].approved++; byOfficial[sub.id].approvedAmount += v.amount || 0; }
      else if (v.status === "pending") byOfficial[sub.id].pending++;
      else if (v.status === "rejected") byOfficial[sub.id].rejected++;
    }

    // R6 — Settlement / reconciliation: which approved vouchers are settled
    // against an issued/cleared cheque, and how much is still outstanding.
    const approvedRows = rows.filter((v) => v.status === "approved");
    const approvedIds = approvedRows.map((v) => v.id);
    const settledMap = new Map<string, { cheque_no: string | null; status: string }>();
    if (approvedIds.length > 0) {
      const { data: cheques } = await supabase
        .from("finance_entries")
        .select("voucher_id, cheque_no, status")
        .in("voucher_id", approvedIds)
        .in("status", ["issued", "cleared"]);
      for (const c of cheques || []) {
        if (c.voucher_id) settledMap.set(c.voucher_id, { cheque_no: c.cheque_no, status: c.status });
      }
    }
    let settledCount = 0, settledAmount = 0, unsettledCount = 0, outstandingAmount = 0;
    const chequeStatus: Record<string, number> = {};
    const unsettledApproved: { id: string; title: string; amount: number; submitter_name: string; approved_at: string | null }[] = [];
    for (const v of approvedRows) {
      const s = settledMap.get(v.id);
      if (s) {
        settledCount++;
        settledAmount += v.amount || 0;
        chequeStatus[s.status] = (chequeStatus[s.status] || 0) + 1;
      } else {
        unsettledCount++;
        outstandingAmount += v.amount || 0;
        unsettledApproved.push({ id: v.id, title: v.title, amount: v.amount || 0, submitter_name: v.submitter?.name || "Unknown", approved_at: v.approved_at || v.created_at });
      }
    }
    unsettledApproved.sort((a, b) => b.amount - a.amount);
    const settlement = { settledCount, unsettledCount, settledAmount, outstandingAmount, chequeStatus, unsettledApproved };

    // R7 — Pending aging / SLA: how long pending vouchers have waited.
    const nowMs = Date.now();
    const agingBuckets = [
      { label: "0-3 days", min: 0, max: 3, count: 0, amount: 0 },
      { label: "4-7 days", min: 4, max: 7, count: 0, amount: 0 },
      { label: ">7 days", min: 8, max: Infinity, count: 0, amount: 0 },
    ];
    const agingList: { id: string; title: string; amount: number; submitter_name: string; ageDays: number; created_at: string }[] = [];
    for (const v of rows) {
      if (v.status !== "pending") continue;
      const ageDays = Math.floor((nowMs - new Date(v.created_at).getTime()) / 86400000);
      const b = agingBuckets.find((bk) => ageDays >= bk.min && ageDays <= bk.max) || agingBuckets[agingBuckets.length - 1];
      b.count++;
      b.amount += v.amount || 0;
      agingList.push({ id: v.id, title: v.title, amount: v.amount || 0, submitter_name: v.submitter?.name || "Unknown", ageDays, created_at: v.created_at });
    }
    agingList.sort((a, b) => b.ageDays - a.ageDays);
    const aging = {
      buckets: agingBuckets.map(({ label, count, amount }) => ({ label, count, amount })),
      oldestDays: agingList[0]?.ageDays ?? 0,
      list: agingList.slice(0, 50),
    };

    return NextResponse.json({
      vouchers: rows.map((v) => ({
        id: v.id,
        title: v.title,
        amount: v.amount,
        category: v.category,
        status: v.status,
        expense_date: v.expense_date,
        invoice_number: v.invoice_number,
        vendor_name: v.vendor_name,
        created_at: v.created_at,
        submitter_name: v.submitter?.name || "Unknown",
        submitter_type: v.submitter?.official_type || "",
      })),
      summary: { total, approved, pending, rejected, totalAmount, pendingAmount },
      byCategory: Object.values(byCategory).sort((a, b) => b.approvedAmount - a.approvedAmount),
      byOfficial: Object.values(byOfficial).sort((a, b) => b.approvedAmount - a.approvedAmount),
      settlement,
      aging,
      categories,
      officials,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/reports/expenses", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch expense report" }, { status: 500 });
  }
}
