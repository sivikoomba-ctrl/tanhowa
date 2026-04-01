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
      categories,
      officials,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/reports/expenses", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch expense report" }, { status: 500 });
  }
}
