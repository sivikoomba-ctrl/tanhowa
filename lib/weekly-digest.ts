/**
 * Weekly digest — one batched email with the week's announcements + upcoming
 * events, replacing per-event member blasts. Recipients are approved members
 * who have a deliverable email (bounce suppression, see lib/inactive-nudge /
 * the zeptomail webhook) and haven't opted out of the digest
 * (notification_prefs.weekly_digest). Opt-out model: missing/true = included.
 *
 * The actual send is done by the caller via lib/mail.sendToRecipients() so the
 * throttling + HOLD_MEMBER_EMAILS kill-switch stay in one place.
 */
import { getServiceClient } from "@/lib/supabase";

const SITE_BASE = "https://www.tanhowa.in";

export interface DigestContent {
  announcements: { title: string; snippet: string }[];
  events: { title: string; date: string; location: string | null }[];
  generatedAt: string;
}

function stripHtml(s: string): string {
  return (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function fmtEventDate(d: string): string {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}

/** Gather the last 7 days of announcements + the next 14 days of events. */
export async function buildDigestContent(): Promise<DigestContent> {
  const supabase = getServiceClient();
  const nowIso = new Date().toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const today = nowIso.slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [annRes, evRes] = await Promise.all([
    supabase
      .from("announcements")
      .select("title, content, published, scheduled_at, created_at")
      .eq("published", true)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("events")
      .select("title, date, location")
      .gte("date", today)
      .lte("date", in14)
      .order("date", { ascending: true })
      .limit(8),
  ]);

  const announcements = (annRes.data || [])
    .filter((a) => !a.scheduled_at || a.scheduled_at <= nowIso)
    .map((a) => {
      const text = stripHtml(a.content);
      return { title: a.title, snippet: text.length > 140 ? text.slice(0, 140) + "…" : text };
    });

  const events = (evRes.data || []).map((e) => ({
    title: e.title,
    date: fmtEventDate(e.date),
    location: e.location || null,
  }));

  return { announcements, events, generatedAt: nowIso };
}

export function digestIsEmpty(c: DigestContent): boolean {
  return c.announcements.length === 0 && c.events.length === 0;
}

/** Inner HTML (wrapped by mail.wrapEmailTemplate at send time). */
export function renderDigestHtml(c: DigestContent): string {
  const ann = c.announcements.length
    ? `<h2 style="color:#2d6a4f;font-size:16px;margin:0 0 8px">📢 Latest Announcements</h2>` +
      c.announcements
        .map(
          (a) =>
            `<div style="margin:0 0 12px"><p style="font-size:14px;font-weight:600;color:#333;margin:0 0 2px">${escapeText(a.title)}</p>${a.snippet ? `<p style="font-size:13px;color:#666;margin:0;line-height:1.5">${escapeText(a.snippet)}</p>` : ""}</div>`
        )
        .join("")
    : "";

  const ev = c.events.length
    ? `<h2 style="color:#2d6a4f;font-size:16px;margin:18px 0 8px">📅 Upcoming Events</h2>` +
      c.events
        .map(
          (e) =>
            `<div style="margin:0 0 8px"><p style="font-size:14px;color:#333;margin:0"><strong>${escapeText(e.date)}</strong> — ${escapeText(e.title)}${e.location ? ` <span style="color:#888">· ${escapeText(e.location)}</span>` : ""}</p></div>`
        )
        .join("")
    : "";

  return `
    <p style="font-size:15px;color:#333;margin:0 0 4px">Your weekly TANHOWA update</p>
    <p style="font-size:12px;color:#999;margin:0 0 16px">Here's what's new this week.</p>
    ${ann}
    ${ev}
    <p style="text-align:center;margin:22px 0 6px">
      <a href="${SITE_BASE}/dashboard" style="display:inline-block;padding:10px 20px;background:#2d6a4f;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">Open the Portal</a>
    </p>
    <p style="font-size:12px;color:#999;text-align:center;margin:10px 0 0">Have pending dues? <a href="${SITE_BASE}/dashboard/payment-status" style="color:#2d6a4f">Check your payment status</a>.</p>
    <p style="font-size:11px;color:#bbb;text-align:center;margin:14px 0 0">You can turn off this weekly digest in Profile → Notification Preferences.</p>
  `;
}

function escapeText(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Approved members with a deliverable email who haven't opted out. */
export async function getDigestRecipients(): Promise<string[]> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("users")
    .select("email, email_status, notification_prefs")
    .eq("status", "approved");
  return (data || [])
    .filter(
      (u) =>
        !!u.email &&
        (u.email_status ?? "active") === "active" &&
        (u.notification_prefs?.weekly_digest !== false) && // opt-out: missing/true => in
        (u.notification_prefs?.email !== false) // also respect the master email toggle
    )
    .map((u) => u.email as string);
}
