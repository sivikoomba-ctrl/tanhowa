import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isSuperAdmin, isFinanceTeamMember, getOfficialInfo, type SessionPayload } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logAudit } from "@/lib/audit-log";

// Statuses that affect the running balance (cancelled/bounced cheques don't)
const ACTIVE_DEBIT_STATUSES = new Set(["issued", "cleared"]);

async function canManageEntries(session: SessionPayload): Promise<boolean> {
  return (await isSuperAdmin(session)) || (await isFinanceTeamMember(session.userId));
}

/**
 * GET /api/finance?year=2025-26
 *
 * Full ledger: admins, state officials
 * District-scoped ledger: district officials (DS/DJS)
 * Abstract summary only: regular members
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await isAdmin(session);
    const officialInfo = await getOfficialInfo(session.userId);
    const isStateOfficial = officialInfo.official_type === "state";
    const isDistrictOfficial = officialInfo.official_type === "district" && !!officialInfo.district;
    const hasFullAccess = admin || isStateOfficial || isDistrictOfficial;

    const url = new URL(req.url);

    // Cheque <-> voucher settlement view (all-time, finance team only)
    if (url.searchParams.get("matching") === "1") {
      if (!(await canManageEntries(session))) {
        return NextResponse.json({ error: "Finance team access required" }, { status: 403 });
      }
      const supabaseM = getServiceClient();
      const [vouchersRes, entriesRes] = await Promise.all([
        supabaseM
          .from("expense_vouchers")
          .select("id, title, amount, paid_to, vendor_name, expense_date, expense_event, approved_at, submitter:submitted_by(name)")
          .eq("status", "approved")
          .order("approved_at", { ascending: false }),
        supabaseM.from("finance_entries").select("*").order("entry_date", { ascending: false }),
      ]);
      const vouchers = vouchersRes.data || [];
      const entries = entriesRes.data || [];

      const activelySettled = new Set(
        entries.filter((fe) => fe.voucher_id && ACTIVE_DEBIT_STATUSES.has(fe.status)).map((fe) => fe.voucher_id)
      );
      const voucherMap = new Map(vouchers.map((v) => [v.id, v]));

      return NextResponse.json({
        unsettledVouchers: vouchers.filter((v) => !activelySettled.has(v.id)),
        unlinkedCheques: entries.filter((fe) => !fe.voucher_id),
        matches: entries
          .filter((fe) => fe.voucher_id)
          .map((fe) => ({ entry: fe, voucher: voucherMap.get(fe.voucher_id) || null })),
      });
    }

    const year = url.searchParams.get("year") || "2026-27";

    // Financial year: April 1 to March 31
    const [startYear] = year.split("-").map(Number);
    const fyStart = `${startYear}-04-01T00:00:00.000Z`;
    const fyEnd = `${startYear + 1}-03-31T23:59:59.999Z`;

    const supabase = getServiceClient();

    // Fetch all paid subscriptions in this financial year
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("id, user_id, period, amount, paid_at, approved_at, payment_method, transaction_id, remarks, payment_group_id, users!subscriptions_user_id_fkey(name, phone, posting_details)")
      .eq("status", "paid")
      .gte("paid_at", fyStart)
      .lte("paid_at", fyEnd)
      .order("paid_at", { ascending: true });

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/finance", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }

    // Build ledger entries — consolidate grouped payments (same payment_group_id) into single rows
    const allSubs = (subs || []).filter((sub) => {
      if (!isDistrictOfficial || admin || isStateOfficial) return true;
      const user = sub.users as unknown as { posting_details: { regular_district?: string } | null };
      return user?.posting_details?.regular_district === officialInfo.district;
    });

    // Separate grouped and ungrouped subscriptions
    const groupedMap = new Map<string, typeof allSubs>();
    const ungrouped: typeof allSubs = [];

    for (const sub of allSubs) {
      if (sub.payment_group_id) {
        const existing = groupedMap.get(sub.payment_group_id) || [];
        existing.push(sub);
        groupedMap.set(sub.payment_group_id, existing);
      } else {
        ungrouped.push(sub);
      }
    }

    // Build consolidated entries: one row per ungrouped sub, one row per payment group
    interface RawLedgerEntry {
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
      linked_members: { name: string; period: string; amount: number; district: string }[];
      entry_kind?: "credit" | "debit";
      status?: string;
      entry_type?: string;
      voucher_id?: string | null;
    }

    const rawEntries: RawLedgerEntry[] = [];

    // Ungrouped: one row each
    for (const sub of ungrouped) {
      const user = sub.users as unknown as { name: string; phone: string; posting_details: { regular_district?: string } | null };
      rawEntries.push({
        id: sub.id,
        date: sub.paid_at,
        description: `Subscription - ${sub.period}`,
        member_name: user?.name || "Unknown",
        member_phone: user?.phone || "",
        district: user?.posting_details?.regular_district || "Unassigned",
        period: sub.period,
        credit: sub.amount || 0,
        debit: 0,
        balance: 0,
        payment_method: sub.payment_method || "",
        transaction_id: sub.transaction_id || "",
        remarks: sub.remarks || "",
        payment_group_id: null,
        linked_members: [],
      });
    }

    // Grouped: one consolidated row per payment_group_id
    for (const [groupId, groupSubs] of groupedMap) {
      const totalAmount = groupSubs.reduce((sum, s) => sum + (s.amount || 0), 0);
      // Use the earliest paid_at as the transaction date
      const sortedByDate = [...groupSubs].sort((a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime());
      const primary = sortedByDate[0];
      const primaryUser = primary.users as unknown as { name: string; phone: string; posting_details: { regular_district?: string } | null };

      const periods = [...new Set(groupSubs.map((s) => s.period))];
      const memberNames = [...new Set(groupSubs.map((s) => {
        const u = s.users as unknown as { name: string };
        return u?.name || "Unknown";
      }))];

      const otherCount = groupSubs.length - 1;
      const displayName = otherCount > 0
        ? `${primaryUser?.name || "Unknown"} (+${otherCount} member${otherCount > 1 ? "s" : ""})`
        : primaryUser?.name || "Unknown";

      const description = memberNames.length > 1
        ? `Bulk Payment - ${periods.join(", ")}`
        : `Split Payment - ${periods.join(", ")}`;

      const linkedMembers = groupSubs.map((s) => {
        const u = s.users as unknown as { name: string; posting_details: { regular_district?: string } | null };
        return {
          name: u?.name || "Unknown",
          period: s.period,
          amount: s.amount || 0,
          district: u?.posting_details?.regular_district || "Unassigned",
        };
      });

      rawEntries.push({
        id: primary.id,
        date: primary.paid_at,
        description,
        member_name: displayName,
        member_phone: primaryUser?.phone || "",
        district: primaryUser?.posting_details?.regular_district || "Unassigned",
        period: periods.join(", "),
        credit: totalAmount,
        debit: 0,
        balance: 0,
        payment_method: primary.payment_method || "",
        transaction_id: primary.transaction_id || "",
        remarks: primary.remarks || "",
        payment_group_id: groupId,
        linked_members: linkedMembers,
      });
    }

    // Manual debit entries (cheques issued etc.) — association-level, so not
    // shown in the district-scoped DS/DJS view
    let totalDebits = 0;
    if (!isDistrictOfficial || admin || isStateOfficial) {
      const { data: entries } = await supabase
        .from("finance_entries")
        .select("*")
        .gte("entry_date", `${startYear}-04-01`)
        .lte("entry_date", `${startYear + 1}-03-31`)
        .order("entry_date", { ascending: true });

      for (const fe of entries || []) {
        const active = ACTIVE_DEBIT_STATUSES.has(fe.status);
        if (active) totalDebits += fe.amount || 0;
        rawEntries.push({
          id: fe.id,
          date: fe.entry_date,
          description: fe.cheque_no ? `Cheque #${fe.cheque_no} - ${fe.payee}` : `${fe.entry_type} - ${fe.payee}`,
          member_name: fe.payee,
          member_phone: "",
          district: "-",
          period: "-",
          credit: 0,
          debit: fe.amount || 0,
          balance: 0,
          payment_method: "Cheque",
          transaction_id: fe.cheque_no || "",
          remarks: fe.remarks || "",
          payment_group_id: null,
          linked_members: [],
          entry_kind: "debit",
          status: fe.status,
          entry_type: fe.entry_type,
          voucher_id: fe.voucher_id,
        });
      }
    }

    // Sort by date and compute running balance (cancelled/bounced debits excluded)
    rawEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let runningBalance = 0;
    const ledger = rawEntries.map((entry) => {
      runningBalance += entry.credit;
      if (entry.entry_kind === "debit" && ACTIVE_DEBIT_STATUSES.has(entry.status || "")) {
        runningBalance -= entry.debit;
      }
      return { ...entry, balance: runningBalance };
    });
    const totalCreditsAll = rawEntries.reduce((sum, e) => sum + e.credit, 0);

    // Summaries use individual subscriptions (not consolidated ledger) for accurate counts
    const byPeriod: Record<string, { count: number; total: number }> = {};
    for (const sub of allSubs) {
      const period = sub.period;
      if (!byPeriod[period]) byPeriod[period] = { count: 0, total: 0 };
      byPeriod[period].count++;
      byPeriod[period].total += sub.amount || 0;
    }

    const byDistrict: Record<string, { count: number; total: number }> = {};
    for (const sub of allSubs) {
      const user = sub.users as unknown as { posting_details: { regular_district?: string } | null };
      const district = user?.posting_details?.regular_district || "Unassigned";
      if (!byDistrict[district]) byDistrict[district] = { count: 0, total: 0 };
      byDistrict[district].count++;
      byDistrict[district].total += sub.amount || 0;
    }

    const byMonth: Record<string, { count: number; total: number }> = {};
    for (const sub of allSubs) {
      const month = new Date(sub.paid_at).toLocaleDateString("en-IN", { year: "numeric", month: "short" });
      if (!byMonth[month]) byMonth[month] = { count: 0, total: 0 };
      byMonth[month].count++;
      byMonth[month].total += sub.amount || 0;
    }

    const summaryByPeriod = Object.entries(byPeriod).map(([period, v]) => ({ period, ...v })).sort((a, b) => b.total - a.total);
    const summaryByDistrict = Object.entries(byDistrict).map(([district, v]) => ({ district, ...v })).sort((a, b) => b.total - a.total);
    const summaryByMonth = Object.entries(byMonth).map(([month, v]) => ({ month, ...v }));

    // Members get abstract summary only (no ledger, no member names)
    if (!hasFullAccess) {
      return NextResponse.json({
        year,
        abstract: true,
        totalCredits: totalCreditsAll,
        totalDebits,
        netBalance: runningBalance,
        totalSubscriptions: allSubs.length,
        totalBankEntries: ledger.length,
        byPeriod: summaryByPeriod,
        byMonth: summaryByMonth,
        districtsCount: Object.keys(byDistrict).length,
      });
    }

    // Full access: admins, state officials, district-scoped DS/DJS
    return NextResponse.json({
      year,
      abstract: false,
      ledger,
      totalCredits: totalCreditsAll,
      totalDebits,
      netBalance: runningBalance,
      totalSubscriptions: allSubs.length,
      totalBankEntries: ledger.length,
      byPeriod: summaryByPeriod,
      byDistrict: summaryByDistrict,
      byMonth: summaryByMonth,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/finance", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch finance data" }, { status: 500 });
  }
}

// POST /api/finance — record a manual debit entry (cheque issued)
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await canManageEntries(session))) {
      return NextResponse.json({ error: "Finance team access required" }, { status: 403 });
    }

    const body = await req.json();
    const amount = Number(body.amount);
    if (!body.entry_date || !body.payee?.trim() || !amount || amount <= 0) {
      return NextResponse.json({ error: "Date, payee and a positive amount are required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // A voucher can only be settled by one active cheque
    if (body.voucher_id) {
      const { data: existing } = await supabase
        .from("finance_entries")
        .select("id, cheque_no")
        .eq("voucher_id", body.voucher_id)
        .in("status", ["issued", "cleared"])
        .limit(1)
        .maybeSingle();
      if (existing) {
        return NextResponse.json(
          { error: `This voucher is already settled by cheque ${existing.cheque_no ? "#" + existing.cheque_no : "(no number)"}` },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabase
      .from("finance_entries")
      .insert({
        entry_date: body.entry_date,
        entry_type: body.entry_type || "cheque_issued",
        amount,
        cheque_no: (body.cheque_no || "").trim() || null,
        payee: body.payee.trim(),
        voucher_id: body.voucher_id || null,
        remarks: (body.remarks || "").trim() || null,
        created_by: session.userId,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/finance", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to save entry" }, { status: 500 });
    }

    logAudit(session.userId, "finance_entry_created", "finance_entry", data.id, { amount, payee: data.payee, cheque_no: data.cheque_no });
    return NextResponse.json({ entry: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/finance", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to save entry" }, { status: 500 });
  }
}

// PUT /api/finance — update a debit entry (status changes: cleared/bounced/cancelled)
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await canManageEntries(session))) {
      return NextResponse.json({ error: "Finance team access required" }, { status: 403 });
    }

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) {
      if (!["issued", "cleared", "cancelled", "bounced"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = body.status;
    }
    if (body.entry_date !== undefined) updates.entry_date = body.entry_date;
    if (body.amount !== undefined) updates.amount = Number(body.amount);
    if (body.cheque_no !== undefined) updates.cheque_no = body.cheque_no;
    if (body.payee !== undefined) updates.payee = body.payee;
    if (body.remarks !== undefined) updates.remarks = body.remarks;

    const supabase = getServiceClient();

    // Link/unlink a voucher — a voucher can only be settled by one active cheque
    if (body.voucher_id !== undefined) {
      if (body.voucher_id) {
        const { data: existing } = await supabase
          .from("finance_entries")
          .select("id, cheque_no")
          .eq("voucher_id", body.voucher_id)
          .neq("id", body.id)
          .in("status", ["issued", "cleared"])
          .limit(1)
          .maybeSingle();
        if (existing) {
          return NextResponse.json(
            { error: `This voucher is already settled by cheque ${existing.cheque_no ? "#" + existing.cheque_no : "(no number)"}` },
            { status: 409 }
          );
        }
      }
      updates.voucher_id = body.voucher_id || null;
    }

    const { error } = await supabase.from("finance_entries").update(updates).eq("id", body.id);

    if (error) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    logAudit(session.userId, "finance_entry_updated", "finance_entry", body.id, { status: body.status });
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/finance", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

// DELETE /api/finance?id= — remove a debit entry
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await canManageEntries(session))) {
      return NextResponse.json({ error: "Finance team access required" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    const { error } = await supabase.from("finance_entries").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }
    logAudit(session.userId, "finance_entry_deleted", "finance_entry", id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/finance", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
