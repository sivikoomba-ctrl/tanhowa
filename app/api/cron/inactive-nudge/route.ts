import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";
import { sendTelegramMessage } from "@/lib/telegram";
import { createFeedbackToken, buildFeedbackLink } from "@/lib/feedback-token";
import { requireCronAuth } from "@/lib/cron-auth";

const SITE_BASE = "https://www.tanhowa.in";

async function sendInactiveNudgeEmail(to: string, name: string, feedbackLink: string) {
  const token = process.env.ZEPTOMAIL_TOKEN;
  if (!token) return false;
  const safeName = (name || "Member").replace(/[<>&]/g, "");
  const html = `<div style="font-family:'Poppins',sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fefae0;border-radius:12px"><div style="text-align:center;margin-bottom:20px"><h1 style="color:#2d6a4f;font-size:24px;margin:0">TANHOWA</h1><p style="color:#40916c;font-size:13px;margin:4px 0 0">Tamil Nadu Horticultural Officers Welfare Association</p></div><div style="background:white;border-radius:8px;padding:24px"><p style="font-size:15px;color:#333;margin:0 0 12px">Dear <strong>${safeName}</strong>,</p><p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 16px">We noticed you haven't visited the TANHOWA portal in a while. We'd love to have you back — and we'd really value a quick word on what would help.</p><p style="text-align:center;margin:18px 0"><a href="${SITE_BASE}/dashboard" style="display:inline-block;padding:10px 18px;background:#2d6a4f;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">Visit Portal</a></p><hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0" /><p style="font-size:13px;color:#666;line-height:1.6;margin:0 0 10px">If something is keeping you away, please tell us — it takes 30 seconds and helps us improve:</p><p style="text-align:center;margin:6px 0 0"><a href="${feedbackLink}" style="display:inline-block;padding:8px 14px;border:1px solid #2d6a4f;color:#2d6a4f;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600">Tell us what would bring you back</a></p></div><p style="color:#999;font-size:11px;text-align:center;margin:14px 0 0">TANHOWA — <a href="${SITE_BASE}" style="color:#2d6a4f">tanhowa.in</a></p></div>`;
  try {
    const r = await fetch("https://api.zeptomail.in/v1.1/email", {
      method: "POST",
      headers: { Authorization: `Zoho-enczapikey ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { address: process.env.ZEPTOMAIL_FROM_EMAIL || "tanhowaadmin@tanhowa.in", name: "TANHOWA" },
        to: [{ email_address: { address: to } }],
        subject: "We miss you on the TANHOWA portal",
        htmlbody: html,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

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

    let nudgedTg = 0;
    let nudgedEmail = 0;

    for (const user of inactive) {
      const firstName = user.name?.split(" ")[0] || "Member";
      let feedbackLink: string | null = null;
      try {
        const tok = await createFeedbackToken(user.id);
        feedbackLink = buildFeedbackLink(SITE_BASE, tok);
      } catch { /* token mint failed — proceed without link */ }

      // Telegram nudge if linked
      if (user.telegram_chat_id) {
        const tgMessage = `👋 Hi ${firstName}! We haven't seen you on the TANHOWA portal in a while.\n\n` +
          `📢 Check out the latest announcements and events.\n` +
          `🔗 <a href="${SITE_BASE}/dashboard">Visit Portal</a>` +
          (feedbackLink ? `\n\n💭 <a href="${feedbackLink}">Tell us what would bring you back</a>` : "");
        try {
          await sendTelegramMessage(user.telegram_chat_id, tgMessage);
          nudgedTg++;
        } catch { /* silent — chat may be blocked */ }
      }

      // Email nudge with feedback link (250ms throttle to stay under Gmail bulk threshold)
      if (user.email && feedbackLink) {
        const sent = await sendInactiveNudgeEmail(user.email, firstName, feedbackLink);
        if (sent) nudgedEmail++;
        await sleep(250);
      }
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
