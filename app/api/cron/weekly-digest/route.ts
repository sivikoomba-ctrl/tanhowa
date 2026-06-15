import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";
import { requireCronAuth } from "@/lib/cron-auth";
import { sendToRecipients, memberEmailsOnHold } from "@/lib/mail";
import { buildDigestContent, digestIsEmpty, renderDigestHtml, getDigestRecipients } from "@/lib/weekly-digest";

function isoWeekKey(d = new Date()): string {
  // ISO-8601 week number — Thursday-based.
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Weekly digest cron. Sends one batched email (week's announcements + upcoming
 * events) to opted-in approved members with a deliverable address.
 *
 * Safe to deploy ahead of go-live: while HOLD_MEMBER_EMAILS is true the run is a
 * no-op and does NOT claim the weekly lock, so flipping the switch later still
 * lets that week's digest go out on the next cron tick. Once live, the
 * atomic-claim lock (site_settings key weekly_digest_run_{YYYY-Www}) guarantees
 * one send per ISO week even under concurrent calls.
 */
export async function GET(req: NextRequest) {
  try {
    const unauthorized = requireCronAuth(req);
    if (unauthorized) return unauthorized;

    // Master kill-switch — no-op (and don't burn the weekly lock) while held.
    if (memberEmailsOnHold()) {
      return NextResponse.json({ ok: true, held: true, sent: 0, message: "Member emails on hold" });
    }

    const supabase = getServiceClient();

    const content = await buildDigestContent();
    if (digestIsEmpty(content)) {
      return NextResponse.json({ ok: true, sent: 0, message: "Nothing to send this week" });
    }

    // Atomic weekly claim — only the first caller this ISO week proceeds.
    const weekKey = `weekly_digest_run_${isoWeekKey()}`;
    const { error: claimErr } = await supabase.from("site_settings").insert({ key: weekKey, value: new Date().toISOString() });
    if (claimErr) {
      return NextResponse.json({ ok: true, sent: 0, message: "Already ran this week" });
    }

    const recipients = await getDigestRecipients();
    if (recipients.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: "No eligible recipients" });
    }

    const subject = "TANHOWA — Your weekly update";
    const { sent, failed } = await sendToRecipients(recipients, subject, renderDigestHtml(content));

    return NextResponse.json({ ok: true, sent, failed, recipients: recipients.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/cron/weekly-digest", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
