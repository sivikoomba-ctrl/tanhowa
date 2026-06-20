import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";
import { requireCronAuth } from "@/lib/cron-auth";
import { sendBirthdayDigestEmail } from "@/lib/mail";
import { sendTelegramMessage } from "@/lib/telegram";

// Daily WhatsApp-ready birthday compilation sent to STATE OFFICIALS so they can
// copy-paste it into the TANHOWA WhatsApp group.
// vercel.json cron: 07:30 AM IST (02:00 UTC) -> "0 2 * * *"
export const maxDuration = 120;

const DESIG_ABBR: Record<string, string> = {
  "Assistant Director of Horticulture": "ADH",
  "Horticultural Officer": "HO",
  "Horticulture Officer": "HO",
  "Deputy Director of Horticulture": "DDH",
  "Joint Director of Horticulture": "JDH",
  "Additional Director of Horticulture": "ADDH",
};

export async function GET(req: NextRequest) {
  try {
    const unauthorized = requireCronAuth(req);
    if (unauthorized) return unauthorized;

    const supabase = getServiceClient();

    // Today's date in IST (Vercel runs in UTC)
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const dateStr = now.toLocaleDateString("en-IN", { day: "numeric", month: "long" });

    // Atomic once-per-day claim so a double trigger doesn't double-send
    const { error: claimErr } = await supabase
      .from("site_settings")
      .insert({ key: `birthday_digest_run_${todayStr}`, value: "1" });
    if (claimErr) return NextResponse.json({ ok: true, skipped: "already ran today" });

    // Find members whose DOB (MM-DD) matches today
    const { data: usersWithDob } = await supabase
      .from("users")
      .select("name, dob, occupation, social_links, posting_details")
      .eq("status", "approved")
      .neq("email", "tanhowa19791@gmail.com")
      .not("dob", "is", null);

    const lines: string[] = [];
    for (const u of usersWithDob || []) {
      const parts = (u.dob || "").split("-");
      if (parts.length !== 3) continue;
      if (`${parts[1]}-${parts[2]}` !== mmdd) continue;
      const sl = (u.social_links as Record<string, string>) || {};
      const pd = (u.posting_details as Record<string, string>) || {};
      const title = sl.title || "";
      let name = u.name || "";
      if (title && !name.toUpperCase().startsWith(title.toUpperCase())) name = `${title} ${name}`;
      const desig = DESIG_ABBR[u.occupation || ""] || u.occupation || "";
      const district = pd.special_duty_district || pd.deputed_district || pd.regular_district || "";
      const tail = [desig, district].filter(Boolean).join(", ");
      lines.push(tail ? `${name} - ${tail}` : name);
    }

    if (lines.length === 0) {
      await supabase.from("site_settings").upsert({ key: "birthday_digest_last_run", value: `${todayStr} (none)` }, { onConflict: "key" });
      return NextResponse.json({ ok: true, count: 0 });
    }

    // Build the WhatsApp-ready message
    const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
    const message =
      `🎂 Today's Birthdays - ${dateStr} 🎂\n\n` +
      `Let's wish our TANHOWA family a very happy birthday! 🎉🌼\n\n` +
      `${numbered}\n\n` +
      `🎈 Wishing you health, happiness & success in the year ahead!\n` +
      `- TANHOWA`;

    // Recipients: State officials only
    const { data: officials } = await supabase
      .from("users")
      .select("name, email, telegram_chat_id")
      .eq("official_type", "state")
      .eq("status", "approved");

    let emailed = 0;
    let telegrammed = 0;
    for (const o of officials || []) {
      if (o.email) {
        await sendBirthdayDigestEmail(o.email, dateStr, message).then(() => { emailed++; }).catch(() => {});
        await new Promise((r) => setTimeout(r, 250)); // throttle
      }
      if (o.telegram_chat_id) {
        await sendTelegramMessage(o.telegram_chat_id, `📋 <b>Copy &amp; paste into the WhatsApp group:</b>\n\n${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}`).then(() => { telegrammed++; }).catch(() => {});
      }
    }

    await supabase.from("site_settings").upsert({ key: "birthday_digest_last_run", value: `${todayStr} (${lines.length} birthdays, ${emailed} emailed, ${telegrammed} telegrammed)` }, { onConflict: "key" });

    return NextResponse.json({ ok: true, count: lines.length, emailed, telegrammed });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/cron/birthday-digest", method: "GET", status_code: 500 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
