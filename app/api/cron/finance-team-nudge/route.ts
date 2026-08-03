import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";
import { requireCronAuth } from "@/lib/cron-auth";
import { sendTelegramMessage } from "@/lib/telegram";

// A member who logged zero Finance actions in this many days gets nudged.
// The team's own charter SLA is 48h/7d, so 14 days of total silence is a
// generous bar before we call someone "idle".
const IDLE_DAYS = 14;
const FINANCE_ACTIONS = ["payment_verified", "payment_rejected", "expense_voucher_approved", "expense_voucher_rejected"];
const OWNER_EMAIL = "tanhowa19791@gmail.com";

interface Member {
  id: string;
  name: string;
  email: string | null;
  telegram_chat_id: string | null;
  role: string;
}

function esc(s: string): string {
  return (s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const token = process.env.ZEPTOMAIL_TOKEN;
  if (!token) return false;
  const r = await fetch("https://api.zeptomail.in/v1.1/email", {
    method: "POST",
    headers: { Authorization: `Zoho-enczapikey ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: { address: process.env.ZEPTOMAIL_FROM_EMAIL || "tanhowaadmin@tanhowa.in", name: "TANHOWA" },
      to: [{ email_address: { address: to } }],
      subject,
      htmlbody: html,
    }),
  });
  return r.ok;
}

/**
 * Weekly Finance Team health check. Finds members who logged zero Finance
 * actions (payment verification, voucher review) in the last IDLE_DAYS days,
 * nudges each one directly (email + Telegram), and sends a rollup digest —
 * active vs idle, current backlog — to the Team Lead + owner so the workload
 * imbalance is visible without a manual DB query. Sends nothing if every
 * member has been active.
 */
export async function GET(req: NextRequest) {
  const auth = requireCronAuth(req);
  if (auth) return auth;

  try {
    const supabase = getServiceClient();

    // IST date for the atomic-claim lock (same pattern as lib/daily-greetings.ts)
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const { error: claimErr } = await supabase
      .from("site_settings")
      .insert({ key: `finance_nudge_run_${todayStr}`, value: "1" });
    if (claimErr) return NextResponse.json({ skipped: "already run today" });

    const { data: teams } = await supabase.from("teams").select("id, name").ilike("name", "%finance%");
    const team = (teams || [])[0] || null;
    if (!team) return NextResponse.json({ skipped: "no Finance team found" });

    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("role, user:user_id(id, name, email, telegram_chat_id)")
      .eq("team_id", team.id);
    const members: Member[] = (teamMembers || [])
      .map((tm) => {
        const u = tm.user as unknown as { id: string; name: string; email: string | null; telegram_chat_id: string | null } | null;
        return { id: u?.id || "", name: u?.name || "", email: u?.email || null, telegram_chat_id: u?.telegram_chat_id || null, role: tm.role };
      })
      .filter((m) => m.id);
    if (!members.length) return NextResponse.json({ skipped: "no Finance team members" });

    const since = new Date(Date.now() - IDLE_DAYS * 24 * 3600 * 1000).toISOString();
    const { data: contribRows } = await supabase
      .from("contributions")
      .select("user_id")
      .in("user_id", members.map((m) => m.id))
      .in("action", FINANCE_ACTIONS)
      .gte("created_at", since);
    const activeIds = new Set((contribRows || []).map((r) => r.user_id));

    const lead = members.find((m) => m.role === "lead") || null;
    const idle = members.filter((m) => m.id !== lead?.id && !activeIds.has(m.id));
    const active = members.filter((m) => activeIds.has(m.id));

    if (idle.length === 0) {
      return NextResponse.json({ scanned: members.length, idle: 0, nudged: false });
    }

    const [{ count: pendingSubs }, { count: pendingVouchers }] = await Promise.all([
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("expense_vouchers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    // Nudge each idle member individually.
    let emailed = 0;
    let telegrammed = 0;
    for (const m of idle) {
      const firstName = (m.name || "there").split(" ")[0];
      if (m.email) {
        const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <h2 style="color:#2d6a4f;margin:0 0 4px">TANHOWA Finance Team</h2>
          <p>Hi ${esc(firstName)},</p>
          <p>You're a member of the Finance Team. There are currently <strong>${pendingSubs || 0}</strong> pending subscription payments and <strong>${pendingVouchers || 0}</strong> pending expense vouchers waiting for review — it's been ${IDLE_DAYS}+ days since your last recorded Finance action.</p>
          <p>Whenever you get a chance, a few reviews at <a href="https://tanhowa.in/admin/subscriptions">Subscriptions</a> or <a href="https://tanhowa.in/admin/vouchers">Vouchers</a> would help the team a lot.</p>
          <p style="color:#666;font-size:13px">- TANHOWA Finance Team</p>
        </div>`;
        if (await sendEmail(m.email, "TANHOWA Finance: pending items need review", html)) emailed++;
      }
      if (m.telegram_chat_id) {
        const msg = `<b>TANHOWA Finance Team</b>\nHi ${esc(firstName)}, there are ${pendingSubs || 0} pending subscription payments and ${pendingVouchers || 0} pending vouchers waiting for review. Whenever you get a chance, a few reviews would help the team a lot.`;
        const r = await sendTelegramMessage(m.telegram_chat_id, msg);
        if (r) telegrammed++;
      }
    }

    // Rollup digest to the Team Lead + owner.
    const digestRecipients = [lead?.email, OWNER_EMAIL].filter((e): e is string => !!e);
    let digestSent = false;
    if (digestRecipients.length) {
      const rows = (list: Member[]) => list.map((m) => `<li>${esc(m.name)}</li>`).join("") || "<li style=\"color:#999\">none</li>";
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#2d6a4f;margin:0 0 4px">Finance Team — Weekly Status</h2>
        <p style="color:#666;font-size:13px;margin:0 0 16px">Backlog: <strong>${pendingSubs || 0}</strong> pending subscriptions, <strong>${pendingVouchers || 0}</strong> pending vouchers.</p>
        <p><strong>Active in last ${IDLE_DAYS} days (${active.length}):</strong></p><ul>${rows(active)}</ul>
        <p><strong>Idle, nudged today (${idle.length}):</strong></p><ul>${rows(idle)}</ul>
      </div>`;
      for (const to of digestRecipients) {
        if (await sendEmail(to, `TANHOWA Finance: ${idle.length} idle team member(s)`, html)) digestSent = true;
      }
    }

    return NextResponse.json({ scanned: members.length, idle: idle.length, emailed, telegrammed, digestSent });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/cron/finance-team-nudge", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Nudge run failed" }, { status: 500 });
  }
}
