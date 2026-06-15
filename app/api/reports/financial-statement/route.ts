import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

/**
 * Income & Expenditure statement for a financial year (Apr–Mar), plus the
 * receipts (money in) and payments (money out) registers behind it. Audit pack
 * core. Income = subscriptions actually paid in the window; expenditure =
 * approved vouchers in the window, grouped by category.
 *
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD  (to is exclusive). Defaults to the
 * current Indian FY when absent.
 */
function currentFyRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1; // FY starts April
  return { from: `${y}-04-01`, to: `${y + 1}-04-01` };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const def = currentFyRange();
    const from = url.searchParams.get("from") || def.from;
    const to = url.searchParams.get("to") || def.to;
    const fromIso = new Date(from + "T00:00:00.000Z").toISOString();
    const toIso = new Date(to + "T00:00:00.000Z").toISOString();

    const supabase = getServiceClient();

    const [subsRes, vouchersRes] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("id, period, amount, paid_amount, paid_at, payment_method, transaction_id, users!subscriptions_user_id_fkey(name)")
        .eq("status", "paid")
        .gte("paid_at", fromIso)
        .lt("paid_at", toIso),
      supabase
        .from("expense_vouchers")
        .select("id, title, amount, category, paid_to, vendor_name, approved_at, submitter:submitted_by(name)")
        .eq("status", "approved")
        .gte("approved_at", fromIso)
        .lt("approved_at", toIso),
    ]);

    const subs = subsRes.data || [];
    const vouchers = vouchersRes.data || [];

    // --- Income (receipts) ---
    const receipts = subs
      .map((s) => {
        const received = (s.paid_amount && s.paid_amount > 0) ? s.paid_amount : (s.amount || 0);
        return {
          id: s.id,
          name: (s.users as unknown as { name?: string } | null)?.name || "Unknown",
          period: s.period,
          amount: received,
          paid_at: s.paid_at,
          payment_method: s.payment_method || "",
          transaction_id: s.transaction_id || "",
        };
      })
      .sort((a, b) => (a.paid_at || "").localeCompare(b.paid_at || ""));

    const incomeByPeriodMap: Record<string, { period: string; count: number; amount: number }> = {};
    for (const r of receipts) {
      const p = r.period || "Other";
      if (!incomeByPeriodMap[p]) incomeByPeriodMap[p] = { period: p, count: 0, amount: 0 };
      incomeByPeriodMap[p].count++;
      incomeByPeriodMap[p].amount += r.amount;
    }
    const incomeByPeriod = Object.values(incomeByPeriodMap).sort((a, b) => b.amount - a.amount);
    const totalIncome = receipts.reduce((s, r) => s + r.amount, 0);

    // --- Expenditure (payments) ---
    const payments = vouchers
      .map((v) => ({
        id: v.id,
        title: v.title,
        category: v.category || "Uncategorized",
        amount: v.amount || 0,
        paid_to: v.paid_to || v.vendor_name || "",
        approved_at: v.approved_at,
        submitter: (v.submitter as unknown as { name?: string } | null)?.name || "Unknown",
      }))
      .sort((a, b) => (a.approved_at || "").localeCompare(b.approved_at || ""));

    const expenseByCategoryMap: Record<string, { category: string; count: number; amount: number }> = {};
    for (const p of payments) {
      if (!expenseByCategoryMap[p.category]) expenseByCategoryMap[p.category] = { category: p.category, count: 0, amount: 0 };
      expenseByCategoryMap[p.category].count++;
      expenseByCategoryMap[p.category].amount += p.amount;
    }
    const expenseByCategory = Object.values(expenseByCategoryMap).sort((a, b) => b.amount - a.amount);
    const totalExpenditure = payments.reduce((s, p) => s + p.amount, 0);

    return NextResponse.json({
      range: { from, to },
      income: { byPeriod: incomeByPeriod, total: totalIncome, count: receipts.length },
      expenditure: { byCategory: expenseByCategory, total: totalExpenditure, count: payments.length },
      net: totalIncome - totalExpenditure,
      receipts,
      payments,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/reports/financial-statement", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to generate statement" }, { status: 500 });
  }
}
