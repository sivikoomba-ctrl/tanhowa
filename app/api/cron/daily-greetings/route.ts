import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";

// Vercel Cron runs this daily at 7:00 AM IST (1:30 AM UTC)
// vercel.json: "crons": [{ "path": "/api/cron/daily-greetings", "schedule": "30 1 * * *" }]

const CRON_SECRET = process.env.CRON_SECRET || "";

// Tamil Nadu / Indian Festival Calendar (month-day -> festival)
const FESTIVALS: Record<string, { name: string; emoji: string; greeting: string; message: string }> = {
  "01-01": { name: "New Year", emoji: "🎊🥳", greeting: "Happy New Year!", message: "Wishing all TANHOWA members a prosperous and fruitful New Year! May this year bring growth, happiness, and success in all our endeavors." },
  "01-14": { name: "Pongal", emoji: "🌾☀️🐄", greeting: "Happy Pongal!", message: "Iniya Pongal Nalvazhthukkal! May this harvest festival bring abundance, joy, and prosperity to you and your family. Thai Pirandhal Vazhi Pirakkum!" },
  "01-15": { name: "Mattu Pongal", emoji: "🐄🌸", greeting: "Happy Mattu Pongal!", message: "Happy Mattu Pongal! Let us honor the cattle and nature that sustain our agriculture and horticulture." },
  "01-26": { name: "Republic Day", emoji: "🇮🇳🏛️", greeting: "Happy Republic Day!", message: "Jai Hind! Wishing all members a proud Republic Day. Let us continue serving our nation through horticulture and agriculture." },
  "04-14": { name: "Tamil New Year (Puthandu)", emoji: "🌺🎉🌴", greeting: "Puthandu Vazhthukkal!", message: "Iniya Tamil Puthandu Nalvazhthukkal! Happy Tamil New Year to all TANHOWA members. May this year bring you bountiful harvests and joy!" },
  "05-01": { name: "May Day", emoji: "✊🌿", greeting: "Happy May Day!", message: "Saluting the dedication of all workers. May Day wishes to every hardworking horticultural officer!" },
  "08-15": { name: "Independence Day", emoji: "🇮🇳🕊️", greeting: "Happy Independence Day!", message: "Jai Hind! Happy Independence Day! Let us renew our commitment to building a greener, self-reliant India." },
  "09-05": { name: "Teachers' Day", emoji: "📚🙏", greeting: "Happy Teachers' Day!", message: "Honoring all the teachers and mentors who shaped us. Happy Teachers' Day to TANHOWA members who also teach and guide!" },
  "10-02": { name: "Gandhi Jayanti", emoji: "🕊️🌸", greeting: "Gandhi Jayanti Wishes!", message: "Remembering Mahatma Gandhi on his birth anniversary. Let us follow the path of truth, non-violence, and service to the nation." },
  "10-20": { name: "Ayudha Pooja", emoji: "🛠️📚🌸", greeting: "Happy Ayudha Pooja!", message: "Happy Ayudha Pooja! May our tools of work — from nurseries to fields — be blessed for another year of fruitful service." },
  "10-21": { name: "Vijayadashami", emoji: "🏆🌟", greeting: "Happy Vijayadashami!", message: "Vijayadashami Nalvazhthukkal! May the triumph of good over evil inspire us in our work. Auspicious beginnings for all!" },
  "11-01": { name: "Deepavali", emoji: "🪔✨🎆", greeting: "Happy Deepavali!", message: "Deepavali Nalvazhthukkal! May the festival of lights illuminate your life with joy, health, and prosperity. Wishing all TANHOWA members a sparkling Diwali!" },
  "12-25": { name: "Christmas", emoji: "🎄🎁⭐", greeting: "Merry Christmas!", message: "Merry Christmas to all TANHOWA members! May the spirit of Christmas bring peace, love, and joy to you and your families." },
  "12-31": { name: "New Year's Eve", emoji: "🎆🥂", greeting: "Happy New Year's Eve!", message: "As we bid farewell to this year, let us celebrate our achievements and look forward to an even better year ahead!" },
};

function wrapEmail(content: string): string {
  return `<div style="font-family:'Poppins',sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fefae0;border-radius:12px"><div style="text-align:center;margin-bottom:24px"><h1 style="color:#2d6a4f;font-size:28px;margin:0">TANHOWA</h1><p style="color:#40916c;font-size:14px;margin:4px 0 0">Tamil Nadu Horticultural Officers Welfare Association</p></div><div style="background:white;border-radius:8px;padding:24px">${content}</div><p style="color:#999;font-size:11px;text-align:center;margin:16px 0 0">TANHOWA - <a href="https://tanhowa.in" style="color:#2d6a4f">Visit Portal</a></p></div>`;
}

async function sendBcc(from: string, to: string[], subject: string, html: string) {
  const token = process.env.ZEPTOMAIL_TOKEN;
  if (!token || to.length === 0) return;

  const BATCH = 40;
  for (let i = 0; i < to.length; i += BATCH) {
    const batch = to.slice(i, i + BATCH);
    try {
      await fetch("https://api.zeptomail.in/v1.1/email", {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: { address: from, name: "TANHOWA" },
          to: [{ email_address: { address: batch[0] } }],
          bcc: batch.slice(1).map((e) => ({ email_address: { address: e } })),
          subject,
          htmlbody: html,
        }),
      });
    } catch {
      // continue
    }
  }
}

async function sendDirectEmail(from: string, to: string, subject: string, html: string) {
  const token = process.env.ZEPTOMAIL_TOKEN;
  if (!token) return;
  try {
    await fetch("https://api.zeptomail.in/v1.1/email", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { address: from, name: "TANHOWA" },
        to: [{ email_address: { address: to } }],
        subject,
        htmlbody: html,
      }),
    });
  } catch {
    // silent
  }
}

async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch {
    // silent
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!CRON_SECRET) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Verify cron secret (Vercel sends this header)
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const fromEmail = process.env.ZEPTOMAIL_FROM_EMAIL || "tanhowaadmin@tanhowa.in";

    // Get current date in IST
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const dateStr = now.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

    const results: string[] = [];

    // Get all member emails for broadcast
    const { data: allUsers } = await supabase
      .from("users")
      .select("email")
      .eq("status", "approved")
      .neq("email", "tanhowa19791@gmail.com");
    const allEmails = (allUsers || []).map((u: { email: string }) => u.email).filter(Boolean);

    // Get admin ID for announcements
    const { data: adminUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", "tanhowaadmin@tanhowa.in")
      .single();
    const adminId = adminUser?.id || null;

    // ==================== BIRTHDAY GREETINGS ====================
    const { data: usersWithDob } = await supabase
      .from("users")
      .select("id, name, email, dob, telegram_chat_id, social_links")
      .eq("status", "approved")
      .neq("email", "tanhowa19791@gmail.com")
      .not("dob", "is", null);

    const birthdayMembers: { name: string; email: string; displayName: string; telegram_chat_id: string | null }[] = [];

    for (const u of usersWithDob || []) {
      if (!u.dob) continue;
      const parts = u.dob.split("-");
      if (parts.length !== 3) continue;
      const userMmdd = `${parts[1]}-${parts[2]}`;
      if (userMmdd === mmdd) {
        const sl = u.social_links || {};
        const title = sl.title || "";
        let displayName = u.name || "";
        if (title && !displayName.toUpperCase().startsWith(title.toUpperCase())) {
          displayName = `${title} ${displayName}`;
        }
        birthdayMembers.push({
          name: u.name,
          email: u.email,
          displayName,
          telegram_chat_id: u.telegram_chat_id,
        });
      }
    }

    if (birthdayMembers.length > 0) {
      results.push(`Birthdays: ${birthdayMembers.length}`);

      // Personal email + Telegram to each birthday person
      for (const b of birthdayMembers) {
        const personalHtml = `<div style="text-align:center;padding:20px"><div style="font-size:48px;margin-bottom:16px">🎂🌸🎉</div><h2 style="color:#2d6a4f;font-size:22px;margin:0 0 8px">Happy Birthday!</h2><p style="font-size:16px;color:#333;margin:0 0 16px">Dear <strong>${b.displayName}</strong>,</p><p style="font-size:14px;color:#555;line-height:1.6">Wishing you a wonderful birthday filled with joy, good health, and success! May this year bring you new achievements and happiness.</p><div style="background:#f0f8f0;border-radius:8px;padding:16px;margin:20px 0"><p style="color:#2d6a4f;font-weight:600;margin:0">With warm wishes from all members of TANHOWA</p></div></div>`;
        await sendDirectEmail(fromEmail, b.email, `Happy Birthday, ${b.displayName}! 🎂 - TANHOWA`, wrapEmail(personalHtml));

        if (b.telegram_chat_id) {
          await sendTelegram(b.telegram_chat_id, `🎂🎉 <b>Happy Birthday, ${b.displayName}!</b>\n\nWishing you a wonderful birthday filled with joy and success!\n\n<i>With warm wishes from TANHOWA</i> 🌿`);
        }
      }

      // Broadcast to all members
      const plural = birthdayMembers.length > 1 ? "s" : "";
      const namesHtml = birthdayMembers.map((b) => `<li style="margin:4px 0;font-size:14px">🎂 <strong>${b.displayName}</strong></li>`).join("");
      const broadcastHtml = `<div style="text-align:center;padding:16px"><div style="font-size:40px;margin-bottom:12px">🎉🎂🌸</div><h2 style="color:#2d6a4f;font-size:20px;margin:0 0 12px">Birthday Celebration${plural} Today!</h2><p style="font-size:14px;color:#555;margin:0 0 16px">Let us wish our fellow member${plural} a very happy birthday:</p><ul style="list-style:none;padding:0;text-align:left;display:inline-block">${namesHtml}</ul><div style="background:#f0f8f0;border-radius:8px;padding:12px;margin:16px 0"><p style="color:#2d6a4f;font-weight:600;margin:0;font-size:13px">Send your wishes! 🌿</p></div></div>`;
      const namesStr = birthdayMembers.map((b) => b.displayName).join(", ");
      await sendBcc(fromEmail, allEmails, `🎂 Birthday Celebration${plural} Today! - ${namesStr}`, wrapEmail(broadcastHtml));

      // Create announcement
      const namesList = birthdayMembers.map((b) => `🎂 ${b.displayName}`).join("\n");
      await supabase.from("announcements").insert({
        title: `Birthday Wishes - ${dateStr}`,
        content: `Wishing a very happy birthday to our fellow member${plural}!\n\n${namesList}\n\nMay this year bring you new achievements, good health, and happiness! 🌸🎉\n\n- TANHOWA Family`,
        author_id: adminId,
        published: true,
      });
    }

    // ==================== FESTIVAL GREETINGS ====================
    const festival = FESTIVALS[mmdd];

    if (festival) {
      results.push(`Festival: ${festival.name}`);

      const festHtml = `<div style="text-align:center;padding:20px"><div style="font-size:48px;margin-bottom:16px">${festival.emoji}</div><h2 style="color:#2d6a4f;font-size:24px;margin:0 0 12px">${festival.greeting}</h2><p style="font-size:14px;color:#555;line-height:1.7;max-width:400px;margin:0 auto 20px">${festival.message}</p><div style="background:#f0f8f0;border-radius:8px;padding:16px;margin:16px 0"><p style="color:#2d6a4f;font-weight:600;margin:0;font-size:14px">Warm wishes from TANHOWA Family</p></div><p style="font-size:12px;color:#888">🌿 Growing Together, Nurturing Tomorrow 🌿</p></div>`;
      await sendBcc(fromEmail, allEmails, `${festival.emoji} ${festival.greeting} - TANHOWA`, wrapEmail(festHtml));

      // Telegram broadcast to linked members
      const { data: tgUsers } = await supabase
        .from("users")
        .select("telegram_chat_id")
        .eq("status", "approved")
        .not("telegram_chat_id", "is", null);
      for (const u of tgUsers || []) {
        if (u.telegram_chat_id) {
          await sendTelegram(u.telegram_chat_id, `${festival.emoji} <b>${festival.greeting}</b>\n\n${festival.message}\n\n<i>- TANHOWA Family</i> 🌿`);
        }
      }

      // Create announcement
      await supabase.from("announcements").insert({
        title: `${festival.emoji} ${festival.greeting}`,
        content: `${festival.message}\n\nWarm wishes from TANHOWA Family!\n\n🌿 Growing Together, Nurturing Tomorrow 🌿`,
        author_id: adminId,
        published: true,
      });
    }

    if (results.length === 0) {
      results.push("No birthdays or festivals today");
    }

    return NextResponse.json({
      ok: true,
      date: dateStr,
      mmdd,
      results,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/cron/daily-greetings", method: "GET", status_code: 500 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
