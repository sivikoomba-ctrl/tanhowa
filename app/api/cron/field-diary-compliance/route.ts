import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { requireCronAuth } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { sendFieldDiaryMissedNudge } from "@/lib/mail";
import { sendTelegramMessage } from "@/lib/telegram";
import { todayIST, yesterdayIST } from "@/lib/field-diary";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Nightly (00:00 IST) sweep: find approved members who did not submit a
 * Field Diary entry yesterday and nudge them by email + Telegram. Never
 * blocks or gates the member's own submission — read-side reminder only.
 * Atomic-claim lock mirrors lib/daily-greetings.ts so concurrent/retried
 * cron invocations don't double-send.
 */
export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  try {
    const supabase = getServiceClient();
    const todayStr = todayIST();
    const targetDate = yesterdayIST();

    const { error: claimErr } = await supabase
      .from("site_settings")
      .insert({ key: `field_diary_compliance_run_${todayStr}`, value: "1" });
    if (claimErr) {
      return NextResponse.json({ message: "Already ran today" });
    }

    const { data: members } = await supabase
      .from("users")
      .select("id, name, email, telegram_chat_id")
      .eq("status", "approved");

    const memberIds = (members || []).map((m) => m.id);
    const { data: submitted } = await supabase
      .from("field_diary_entries")
      .select("member_id")
      .eq("entry_date", targetDate)
      .in("member_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
    const submittedIds = new Set((submitted || []).map((s) => s.member_id as string));

    const nonSubmitters = (members || []).filter((m) => !submittedIds.has(m.id));

    let nudged = 0;
    for (const m of nonSubmitters) {
      try {
        await sendFieldDiaryMissedNudge(m.email, m.name || "Member");
        if (m.telegram_chat_id) {
          await sendTelegramMessage(
            m.telegram_chat_id,
            `🌱 <b>Field Diary Reminder</b>\n\nYou haven't logged a Field Diary entry recently. Please take a moment to record today's field work.\n\nhttps://tanhowa.in/dashboard/field-diary`,
          );
        }
        nudged++;
        await sleep(150);
      } catch {
        /* continue to next member */
      }
    }

    return NextResponse.json({ targetDate, totalMembers: members?.length || 0, nonSubmitters: nonSubmitters.length, nudged });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: `field-diary-compliance cron failed: ${msg}`,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/cron/field-diary-compliance",
      method: "GET",
      status_code: 500,
    });
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
