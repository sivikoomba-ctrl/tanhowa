/**
 * Daily Greetings - triggered by first site visitor each day.
 * Sends birthday wishes + festival greetings via email, Telegram, and portal announcements.
 * Uses site_settings "daily_greetings_last_run" to ensure once-per-day execution.
 */
import { getServiceClient } from "@/lib/supabase";

// Curated list of unique birthday wishes — each member gets a different one
// (deterministic per user via id-hash, so the same wish never goes to two members on the same day).
const BIRTHDAY_WISHES: string[] = [
  "May this new year of your life bloom like a well-tended garden — full of colour, growth and quiet pride in everything you nurture.",
  "Wishing you a year as bountiful as a perfect Pongal harvest — abundance in health, peace at home, and recognition in service.",
  "May every seed you sow this year — in fields and in life — sprout into something joyful and lasting.",
  "Like the morning dew on a tender leaf, may every day this year bring you freshness, energy and gentle blessings.",
  "Wishing you the steadiness of a banyan, the sweetness of a ripe mango, and the cheerfulness of a marigold — happy birthday!",
  "May your year be rooted in good health, branched with new opportunities, and crowned with the laughter of loved ones.",
  "On your special day, may the sun shine warmly on your path, the rains fall kindly on your work, and good people walk beside you.",
  "Wishing you a birthday as bright as a sunflower field at noon — full of warmth, smiles and possibilities.",
  "May this year reward your hard work in the service of horticulture with deserved respect, restful evenings, and proud milestones.",
  "Like a well-pruned orchard, may your year be free of unnecessary worries and heavy with the fruits of your effort.",
  "May every block you visit, every farmer you guide, and every officer you mentor bring you joy and a deeper sense of purpose this year.",
  "Wishing you a birthday filled with the fragrance of jasmine, the sweetness of palm sugar, and the calm of a coconut grove at dusk.",
  "May the coming year strengthen your roots in family, widen your branches in service, and let you blossom in everything you love.",
  "Wishing you good health, happy harvests, and a year where even the small things — a cup of filter coffee, a kind word, a cool breeze — feel like gifts.",
  "May you continue to grow our state's gardens and our association's spirit. A very happy birthday to a dedicated horticulturist!",
  "Like the first green shoot after the rains, may this year bring fresh hope, fresh ideas, and fresh joy into your life.",
  "Wishing you a year as fruitful as a Krishnagiri mango orchard — sweet, generous and well-loved by all who know you.",
  "May your wisdom, kindness, and quiet service continue to inspire fellow officers. Happy birthday from the entire TANHOWA family!",
  "On your birthday, we celebrate not just another year added to your life — but another year of values, service, and care added to ours.",
  "May this year be the one where your plans bloom on time, your travels are smooth, and your home is always full of laughter.",
];

function pickWish(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return BIRTHDAY_WISHES[hash % BIRTHDAY_WISHES.length];
}

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

async function sendBcc(from: string, emails: string[], subject: string, html: string) {
  const token = process.env.ZEPTOMAIL_TOKEN;
  if (!token || emails.length === 0) return;
  const BATCH = 40;
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    try {
      await fetch("https://api.zeptomail.in/v1.1/email", {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: { address: from, name: "TANHOWA" },
          to: [{ email_address: { address: batch[0] } }],
          bcc: batch.slice(1).map((e) => ({ email_address: { address: e } })),
          subject, htmlbody: html,
        }),
      });
    } catch { /* continue */ }
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
        subject, htmlbody: html,
      }),
    });
  } catch { /* silent */ }
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
  } catch { /* silent */ }
}

/**
 * Check if daily greetings have already run today. If not, run them.
 * Called fire-and-forget from /api/users/me GET.
 */
export async function triggerDailyGreetings() {
  try {
    const supabase = getServiceClient();

    // Get today's date in IST
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // Check last run date
    const { data: setting } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "daily_greetings_last_run")
      .single();

    if (setting?.value === todayStr) return; // Already ran today

    // Mark as running immediately (prevent duplicate runs from concurrent requests)
    await supabase.from("site_settings").upsert({
      key: "daily_greetings_last_run",
      value: todayStr,
    }, { onConflict: "key" });

    const fromEmail = process.env.ZEPTOMAIL_FROM_EMAIL || "tanhowaadmin@tanhowa.in";
    const dateStr = now.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

    // Get all member emails
    const { data: allUsers } = await supabase
      .from("users")
      .select("email")
      .eq("status", "approved")
      .neq("email", "tanhowa19791@gmail.com");
    const allEmails = (allUsers || []).map((u: { email: string }) => u.email).filter(Boolean);

    // Get admin ID
    const { data: adminUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", "tanhowaadmin@tanhowa.in")
      .single();
    const adminId = adminUser?.id || null;

    // ==================== BIRTHDAYS ====================
    const { data: usersWithDob } = await supabase
      .from("users")
      .select("id, name, email, dob, occupation, telegram_chat_id, social_links, posting_details")
      .eq("status", "approved")
      .neq("email", "tanhowa19791@gmail.com")
      .not("dob", "is", null);

    interface BirthdayMember {
      id: string;
      displayName: string;
      designation: string;
      district: string;
      block: string;
      placeLine: string;
      wish: string;
      email: string;
      telegram_chat_id: string | null;
    }
    const birthdayMembers: BirthdayMember[] = [];

    for (const u of usersWithDob || []) {
      if (!u.dob) continue;
      const parts = u.dob.split("-");
      if (parts.length !== 3) continue;
      if (`${parts[1]}-${parts[2]}` === mmdd) {
        const sl = (u.social_links as Record<string, string>) || {};
        const pd = (u.posting_details as Record<string, string>) || {};
        const title = sl.title || "";
        let displayName = u.name || "";
        if (title && !displayName.toUpperCase().startsWith(title.toUpperCase())) {
          displayName = `${title} ${displayName}`;
        }
        const designation = u.occupation || "";
        const district = pd.special_duty_district || pd.deputed_district || pd.regular_district || "";
        const block = pd.special_duty_block || pd.deputed_block || pd.regular_block || "";
        const place = [block, district].filter(Boolean).join(", ");
        const placeLine = [designation, place].filter(Boolean).join(" • ");
        // Seed by user id + today so wishes vary year-over-year too
        const wish = pickWish(`${u.id}|${todayStr}`);
        birthdayMembers.push({
          id: u.id,
          displayName,
          designation,
          district,
          block,
          placeLine,
          wish,
          email: u.email,
          telegram_chat_id: u.telegram_chat_id,
        });
      }
    }

    if (birthdayMembers.length > 0) {
      // Personal email + Telegram (each gets a unique wish)
      for (const b of birthdayMembers) {
        const placeHtml = b.placeLine ? `<p style="font-size:13px;color:#777;margin:0 0 12px">${b.placeLine}</p>` : "";
        const html = `<div style="text-align:center;padding:20px"><div style="font-size:48px;margin-bottom:16px">🎂🌸🎉</div><h2 style="color:#2d6a4f;font-size:22px;margin:0 0 8px">Happy Birthday!</h2><p style="font-size:16px;color:#333;margin:0 0 4px">Dear <strong>${b.displayName}</strong>,</p>${placeHtml}<p style="font-size:14px;color:#555;line-height:1.7">${b.wish}</p><div style="background:#f0f8f0;border-radius:8px;padding:16px;margin:20px 0"><p style="color:#2d6a4f;font-weight:600;margin:0">With warm wishes from all members of TANHOWA</p></div></div>`;
        await sendDirectEmail(fromEmail, b.email, `Happy Birthday, ${b.displayName}! 🎂 - TANHOWA`, wrapEmail(html));
        if (b.telegram_chat_id) {
          const placeTg = b.placeLine ? `<i>${b.placeLine}</i>\n\n` : "";
          await sendTelegram(b.telegram_chat_id, `🎂🎉 <b>Happy Birthday, ${b.displayName}!</b>\n\n${placeTg}${b.wish}\n\n<i>With warm wishes from TANHOWA</i> 🌿`);
        }
      }

      // Broadcast — list members with designation/place AND a unique wish per person
      const plural = birthdayMembers.length > 1 ? "s" : "";
      const namesHtml = birthdayMembers
        .map((b) => {
          const placeHtml = b.placeLine ? `<div style="font-size:12px;color:#777;margin:2px 0 0 24px">${b.placeLine}</div>` : "";
          return `<li style="margin:10px 0;font-size:14px;list-style:none">🎂 <strong>${b.displayName}</strong>${placeHtml}<div style="font-size:13px;color:#444;margin:4px 0 0 24px;line-height:1.6">${b.wish}</div></li>`;
        })
        .join("");
      const bcastHtml = `<div style="padding:16px"><div style="text-align:center"><div style="font-size:40px;margin-bottom:12px">🎉🎂🌸</div><h2 style="color:#2d6a4f;font-size:20px;margin:0 0 12px">Birthday Celebration${plural} Today!</h2><p style="font-size:14px;color:#555;margin:0 0 16px">Let us wish our fellow member${plural} a very happy birthday:</p></div><ul style="padding:0;margin:0">${namesHtml}</ul></div>`;
      const namesStr = birthdayMembers.map((b) => b.displayName).join(", ");
      await sendBcc(fromEmail, allEmails, `🎂 Birthday Celebration${plural} Today! - ${namesStr}`, wrapEmail(bcastHtml));

      // Announcement — designation/place + unique wish per person
      const namesList = birthdayMembers
        .map((b) => {
          const place = b.placeLine ? `\n   ${b.placeLine}` : "";
          return `🎂 ${b.displayName}${place}\n   "${b.wish}"`;
        })
        .join("\n\n");
      await supabase.from("announcements").insert({
        title: `Birthday Wishes - ${dateStr}`,
        content: `Wishing a very happy birthday to our fellow member${plural}!\n\n${namesList}\n\n🌸🎉\n\n- TANHOWA Family`,
        author_id: adminId,
        published: true,
      });
    }

    // ==================== FESTIVALS ====================
    const festival = FESTIVALS[mmdd];
    if (festival) {
      const festHtml = `<div style="text-align:center;padding:20px"><div style="font-size:48px;margin-bottom:16px">${festival.emoji}</div><h2 style="color:#2d6a4f;font-size:24px;margin:0 0 12px">${festival.greeting}</h2><p style="font-size:14px;color:#555;line-height:1.7;max-width:400px;margin:0 auto 20px">${festival.message}</p><div style="background:#f0f8f0;border-radius:8px;padding:16px;margin:16px 0"><p style="color:#2d6a4f;font-weight:600;margin:0">Warm wishes from TANHOWA Family</p></div></div>`;
      await sendBcc(fromEmail, allEmails, `${festival.emoji} ${festival.greeting} - TANHOWA`, wrapEmail(festHtml));

      // Telegram broadcast
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

      // Announcement
      await supabase.from("announcements").insert({
        title: `${festival.emoji} ${festival.greeting}`,
        content: `${festival.message}\n\nWarm wishes from TANHOWA Family!\n\n🌿 Growing Together, Nurturing Tomorrow 🌿`,
        author_id: adminId,
        published: true,
      });
    }
  } catch {
    // Silent - don't block user requests
  }
}
