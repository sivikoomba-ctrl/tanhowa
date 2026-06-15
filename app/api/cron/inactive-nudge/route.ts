import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";
import { requireCronAuth } from "@/lib/cron-auth";
import { nudgeMember, nudgeCooldownCutoffISO } from "@/lib/inactive-nudge";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Sends nudge emails + Telegram messages to members inactive for 30+ days.
 * Each message includes a personal "tell us why" feedback link with a
 * signed token so the member can respond without logging in.
 * Runs once per day via Vercel Cron or manual trigger.
 * Uses site_settings key "inactive_nudge_last_run" to prevent duplicate runs.
 */
export async function GET(req: NextRequest) {
  try {
    const unauthorized = requireCronAuth(req);
    if (unauthorized) return unauthorized;

    const supabase = getServiceClient();

    // Check last run (once per day)
    const { data: setting } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "inactive_nudge_last_run")
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    if (setting?.value === today) {
      return NextResponse.json({ ok: true, message: "Already ran today", nudged: 0 });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    // Per-member cooldown: nudge each inactive member at most once every 15 days.
    // Without this the daily cron re-emails the same ~329 inactive members every
    // day (huge volume + spam + bounce-driven sender-reputation damage).
    const fifteenDaysAgo = nudgeCooldownCutoffISO();

    // Find inactive approved members (last active > 30 days or never active)
    // who have NOT already been nudged within the last 15 days.
    const { data: inactive } = await supabase
      .from("users")
      .select("id, name, email, telegram_chat_id, last_active_at, login_count, last_inactive_nudge_at")
      .eq("status", "approved")
      .or(`last_active_at.is.null,last_active_at.lt.${thirtyDaysAgo}`)
      .neq("email", "tanhowa19791@gmail.com")
      .neq("email", "tanhowaadmin@tanhowa.in");

    if (!inactive || inactive.length === 0) {
      await upsertSetting(supabase, today);
      return NextResponse.json({ ok: true, nudged: 0 });
    }

    let nudgedTg = 0;
    let nudgedEmail = 0;

    for (const user of inactive) {
      // 15-day per-member cooldown — skip anyone nudged recently.
      if (user.last_inactive_nudge_at && user.last_inactive_nudge_at > fifteenDaysAgo) continue;

      // Shared send path (email + Telegram + cooldown stamp) — see lib/inactive-nudge.ts.
      const { emailed, telegrammed } = await nudgeMember(supabase, user);
      if (emailed) nudgedEmail++;
      if (telegrammed) nudgedTg++;

      // Throttle email to stay under Gmail's bulk threshold.
      if (emailed) await sleep(250);
    }

    const nudgedCount = nudgedTg + nudgedEmail;

    await upsertSetting(supabase, today);

    return NextResponse.json({
      ok: true,
      nudged: nudgedCount,
      nudged_telegram: nudgedTg,
      nudged_email: nudgedEmail,
      total_inactive: inactive.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/cron/inactive-nudge", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertSetting(supabase: any, value: string) {
  await supabase
    .from("site_settings")
    .upsert({ key: "inactive_nudge_last_run", value }, { onConflict: "key" });
}
