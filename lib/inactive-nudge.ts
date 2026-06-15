/**
 * Shared inactive-member nudge send path.
 *
 * Used by BOTH the daily cron (`/api/cron/inactive-nudge`) and the owner-only
 * admin "At-Risk Members" scoped nudge (`/api/admin/at-risk/nudge`) so the two
 * never diverge. Callers own their selection logic + the 15-day cooldown gate;
 * this module just delivers on every available channel and stamps the cooldown.
 */
import { sendTelegramMessage } from "@/lib/telegram";
import { createFeedbackToken, buildFeedbackLink } from "@/lib/feedback-token";

export const NUDGE_SITE_BASE = "https://www.tanhowa.in";

/** Per-member cooldown — nudge any one member at most once per 15 days. */
export const NUDGE_COOLDOWN_DAYS = 15;

export function nudgeCooldownCutoffISO(): string {
  return new Date(Date.now() - NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export interface NudgeableUser {
  id: string;
  name: string | null;
  email: string | null;
  telegram_chat_id: string | null;
}

function nudgeEmailHtml(safeName: string, feedbackLink: string): string {
  return `<div style="font-family:'Poppins',sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fefae0;border-radius:12px"><div style="text-align:center;margin-bottom:20px"><h1 style="color:#2d6a4f;font-size:24px;margin:0">TANHOWA</h1><p style="color:#40916c;font-size:13px;margin:4px 0 0">Tamil Nadu Horticultural Officers Welfare Association</p></div><div style="background:white;border-radius:8px;padding:24px"><p style="font-size:15px;color:#333;margin:0 0 12px">Dear <strong>${safeName}</strong>,</p><p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 16px">We noticed you haven't visited the TANHOWA portal in a while. We'd love to have you back — and we'd really value a quick word on what would help.</p><p style="text-align:center;margin:18px 0"><a href="${NUDGE_SITE_BASE}/dashboard" style="display:inline-block;padding:10px 18px;background:#2d6a4f;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">Visit Portal</a></p><hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0" /><p style="font-size:13px;color:#666;line-height:1.6;margin:0 0 10px">If something is keeping you away, please tell us — it takes 30 seconds and helps us improve:</p><p style="text-align:center;margin:6px 0 0"><a href="${feedbackLink}" style="display:inline-block;padding:8px 14px;border:1px solid #2d6a4f;color:#2d6a4f;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600">Tell us what would bring you back</a></p></div><p style="color:#999;font-size:11px;text-align:center;margin:14px 0 0">TANHOWA — <a href="${NUDGE_SITE_BASE}" style="color:#2d6a4f">tanhowa.in</a></p></div>`;
}

/** Sends the nudge email via ZeptoMail. Returns true on a 2xx response. */
export async function sendInactiveNudgeEmail(to: string, name: string, feedbackLink: string): Promise<boolean> {
  const token = process.env.ZEPTOMAIL_TOKEN;
  if (!token) return false;
  const safeName = (name || "Member").replace(/[<>&]/g, "");
  try {
    const r = await fetch("https://api.zeptomail.in/v1.1/email", {
      method: "POST",
      headers: { Authorization: `Zoho-enczapikey ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { address: process.env.ZEPTOMAIL_FROM_EMAIL || "tanhowaadmin@tanhowa.in", name: "TANHOWA" },
        to: [{ email_address: { address: to } }],
        subject: "We miss you on the TANHOWA portal",
        htmlbody: nudgeEmailHtml(safeName, feedbackLink),
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export interface NudgeResult {
  emailed: boolean;
  telegrammed: boolean;
}

/**
 * Nudge one member on every available channel (email + Telegram), each carrying
 * a personal signed feedback link. Stamps `last_inactive_nudge_at` when any
 * channel actually delivered. Never throws — channel failures are swallowed so
 * one bad address can't abort a batch. The CALLER is responsible for the
 * cooldown check (skip anyone nudged within NUDGE_COOLDOWN_DAYS) before calling.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nudgeMember(supabase: any, user: NudgeableUser): Promise<NudgeResult> {
  const firstName = user.name?.split(" ")[0] || "Member";

  let feedbackLink: string | null = null;
  try {
    const tok = await createFeedbackToken(user.id);
    feedbackLink = buildFeedbackLink(NUDGE_SITE_BASE, tok);
  } catch { /* token mint failed — proceed without link */ }

  let telegrammed = false;
  if (user.telegram_chat_id) {
    const tgMessage =
      `👋 Hi ${firstName}! We haven't seen you on the TANHOWA portal in a while.\n\n` +
      `📢 Check out the latest announcements and events.\n` +
      `🔗 <a href="${NUDGE_SITE_BASE}/dashboard">Visit Portal</a>` +
      (feedbackLink ? `\n\n💭 <a href="${feedbackLink}">Tell us what would bring you back</a>` : "");
    try {
      await sendTelegramMessage(user.telegram_chat_id, tgMessage);
      telegrammed = true;
    } catch { /* silent — chat may be blocked */ }
  }

  let emailed = false;
  if (user.email && feedbackLink) {
    emailed = await sendInactiveNudgeEmail(user.email, firstName, feedbackLink);
  }

  if (emailed || telegrammed) {
    await supabase
      .from("users")
      .update({ last_inactive_nudge_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  return { emailed, telegrammed };
}
