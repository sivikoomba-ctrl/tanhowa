import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * Sends nudge emails/Telegram messages to members inactive for 30+ days.
 * Runs once per day via Vercel Cron or manual trigger.
 * Uses site_settings key "inactive_nudge_last_run" to prevent duplicate runs.
 */
export async function GET() {
  try {
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

    // Find inactive approved members (last active > 30 days or never active)
    const { data: inactive } = await supabase
      .from("users")
      .select("id, name, email, telegram_chat_id, last_active_at, login_count")
      .eq("status", "approved")
      .or(`last_active_at.is.null,last_active_at.lt.${thirtyDaysAgo}`)
      .neq("email", "tanhowa19791@gmail.com")
      .neq("email", "tanhowaadmin@tanhowa.in");

    if (!inactive || inactive.length === 0) {
      await upsertSetting(supabase, today);
      return NextResponse.json({ ok: true, nudged: 0 });
    }

    let nudgedCount = 0;

    for (const user of inactive) {
      // Send Telegram nudge if linked
      if (user.telegram_chat_id) {
        const name = user.name?.split(" ")[0] || "Member";
        const message = `👋 Hi ${name}! We haven't seen you on the TANHOWA portal in a while.\n\n` +
          `📢 Check out the latest announcements and events.\n` +
          `🔗 <a href="https://www.tanhowa.in/dashboard">Visit Portal</a>`;

        try {
          await sendTelegramMessage(user.telegram_chat_id, message);
          nudgedCount++;
        } catch { /* silent — chat may be blocked */ }
      }
    }

    await upsertSetting(supabase, today);

    return NextResponse.json({ ok: true, nudged: nudgedCount, total_inactive: inactive.length });
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
