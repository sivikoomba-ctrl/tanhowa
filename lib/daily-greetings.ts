/**
 * Daily Greetings - triggered by /api/cron/daily-greetings at 07:00 IST.
 * Sends birthday wishes + festival greetings via email, Telegram, and portal announcements.
 * Uses an atomic dated-key INSERT into site_settings so concurrent callers do not double-send.
 */
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";

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

const FESTIVALS: Record<string, { name: string; emoji: string; greeting: string; message: string; announcementOnly?: boolean }> = {
  "01-01": { name: "New Year", emoji: "🎊🥳", greeting: "Happy New Year!", message: "Wishing all TANHOWA members a prosperous and fruitful New Year! May this year bring growth, happiness, and success in all our endeavors." },
  "01-14": { name: "Pongal", emoji: "🌾☀️🐄", greeting: "Happy Pongal!", message: "Iniya Pongal Nalvazhthukkal! May this harvest festival bring abundance, joy, and prosperity to you and your family. Thai Pirandhal Vazhi Pirakkum!" },
  "01-15": { name: "Mattu Pongal", emoji: "🐄🌸", greeting: "Happy Mattu Pongal!", message: "Happy Mattu Pongal! Let us honor the cattle and nature that sustain our agriculture and horticulture." },
  "01-26": { name: "Republic Day", emoji: "🇮🇳🏛️", greeting: "Happy Republic Day!", message: "Jai Hind! Wishing all members a proud Republic Day. Let us continue serving our nation through horticulture and agriculture." },
  "04-14": { name: "Tamil New Year (Puthandu)", emoji: "🌺🎉🌴", greeting: "Puthandu Vazhthukkal!", message: "Iniya Tamil Puthandu Nalvazhthukkal! Happy Tamil New Year to all TANHOWA members. May this year bring you bountiful harvests and joy!" },
  "05-01": { name: "May Day", emoji: "✊🌿", greeting: "Happy May Day!", message: "Saluting the dedication of all workers. May Day wishes to every hardworking horticultural officer!" },
  "06-02": { name: "Tamil Nadu Formation Day", emoji: "🌺🏛️", greeting: "Tamil Nadu Formation Day!", message: "Celebrating the legacy and spirit of Tamil Nadu. As horticultural officers, we are proud to serve this great state and its farming communities. Vanakam Tamil Nadu!", announcementOnly: true },
  "06-05": { name: "World Environment Day", emoji: "🌍🌱", greeting: "Happy World Environment Day!", message: "On World Environment Day, let us reaffirm our commitment to protecting nature and nurturing our environment. As horticultural officers, we are on the front lines of building a greener tomorrow.", announcementOnly: true },
  "06-21": { name: "International Yoga Day", emoji: "🧘🌿", greeting: "Happy International Yoga Day!", message: "Wishing all TANHOWA members a healthy and mindful International Yoga Day. Let us embrace wellness in body and mind as we continue our service to farmers and horticulture.", announcementOnly: true },
  "07-01": { name: "National Doctors Day", emoji: "🩺❤️", greeting: "Happy National Doctors Day!", message: "Grateful tribute to all doctors and health workers on this special day. Your service to our nation is invaluable. TANHOWA salutes your dedication and compassion.", announcementOnly: true },
  "08-09": { name: "Quit India Day / National Handloom Day", emoji: "🇮🇳🏺", greeting: "Quit India Day & National Handloom Day!", message: "On this historic day, we honour the courage of freedom fighters who launched the Quit India Movement in 1942. We also celebrate India's rich handloom heritage and the weavers who keep our traditions alive.", announcementOnly: true },
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendDirectEmail(from: string, to: string, subject: string, html: string) {
  const token = process.env.ZEPTOMAIL_TOKEN;
  if (!token) return;
  try {
    await fetch("https://api.zeptomail.in/v1.1/email", {
      method: "POST",
      headers: { Authorization: `Zoho-enczapikey ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { address: from, name: "TANHOWA" },
        to: [{ email_address: { address: to } }],
        subject, htmlbody: html,
      }),
    });
  } catch { /* silent */ }
}

// Send a broadcast as individual one-to-one emails with throttling.
// Prior implementation BCCed in batches of 40, which Gmail flagged as
// `4.7.28 unusual rate of mail` and rate-limited the whole tanhowa.in
// domain — knocking out OTP delivery for hours after each blast.
// 250ms spacing → ~4 sends/sec, well under bulk-sender thresholds.
async function sendIndividually(from: string, emails: string[], subject: string, html: string) {
  const token = process.env.ZEPTOMAIL_TOKEN;
  if (!token || emails.length === 0) return;
  for (const email of emails) {
    await sendDirectEmail(from, email, subject, html);
    await sleep(250);
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
  } catch { /* silent */ }
}

// Send a photo with HTML caption (Telegram caption limit ~1024 chars).
// Falls back silently — caller should also send a text message if photo fails.
async function sendTelegramPhoto(chatId: string, photoUrl: string, caption: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Allowed photo CDNs — same set the markdown renderer accepts inline.
function isTrustedPhotoUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    return (
      h.endsWith(".supabase.co") ||
      h.endsWith(".fbcdn.net") ||
      h === "platform-lookaside.fbsbx.com" ||
      h.endsWith(".googleusercontent.com")
    );
  } catch {
    return false;
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function initialsFor(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Inline-block circle avatar (HTML-email-safe — uses table-style attrs).
function circleAvatarHtml(name: string, photoUrl: string | null | undefined, sizePx: number): string {
  const safeName = escapeAttr(name);
  if (isTrustedPhotoUrl(photoUrl)) {
    return `<img src="${photoUrl}" alt="${safeName}" width="${sizePx}" height="${sizePx}" style="display:inline-block;width:${sizePx}px;height:${sizePx}px;border-radius:50%;object-fit:cover;vertical-align:middle;border:1px solid #d8e2dc" />`;
  }
  // Fallback — initials avatar
  const initials = escapeAttr(initialsFor(name));
  const fontSize = Math.max(10, Math.round(sizePx * 0.42));
  return `<span style="display:inline-block;width:${sizePx}px;height:${sizePx}px;border-radius:50%;background:#2d6a4f;color:#fff;text-align:center;line-height:${sizePx}px;font-size:${fontSize}px;font-weight:600;vertical-align:middle">${initials}</span>`;
}

/**
 * Check if daily greetings have already run today. If not, run them.
 * Called fire-and-forget from /api/users/me GET, and also by the
 * /api/cron/daily-greetings cron route. Atomic — the unique-key INSERT
 * on a dated marker row ensures only one concurrent caller does the work.
 */
export async function triggerDailyGreetings() {
  try {
    const supabase = getServiceClient();

    // Get today's date in IST
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // Atomic claim of today's run. site_settings.key has a unique constraint,
    // so only the first concurrent request to insert this dated marker succeeds;
    // any other concurrent caller gets a duplicate-key error and bails out.
    const { error: claimErr } = await supabase
      .from("site_settings")
      .insert({ key: `daily_greetings_run_${todayStr}`, value: "1" });
    if (claimErr) return; // Another request already claimed today's run

    // Update the canonical last-run pointer for diagnostics
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
      .select("id, name, email, dob, occupation, telegram_chat_id, social_links, posting_details, photo_url")
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
      photoUrl: string | null;
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
          photoUrl: typeof u.photo_url === "string" && u.photo_url ? u.photo_url : null,
        });
      }
    }

    if (birthdayMembers.length > 0) {
      const plural = birthdayMembers.length > 1 ? "s" : "";

      // Announcement first — so it's created even if email/Telegram sending times out.
      const namesList = birthdayMembers
        .map((b) => {
          const photoMd = isTrustedPhotoUrl(b.photoUrl) ? `![${b.displayName}](${b.photoUrl}) ` : "";
          const place = b.placeLine ? `\n   ${b.placeLine}` : "";
          return `${photoMd}🎂 **${b.displayName}**${place}\n   "${b.wish}"`;
        })
        .join("\n\n");
      await supabase.from("announcements").insert({
        title: `Birthday Wishes - ${dateStr}`,
        content: `Wishing a very happy birthday to our fellow member${plural}!\n\n${namesList}\n\n🌸🎉\n\n- TANHOWA Family`,
        author_id: adminId,
        published: true,
      });

      // Personal email + Telegram only to the birthday person (no broadcast to all members)
      for (const b of birthdayMembers) {
        const placeHtml = b.placeLine ? `<p style="font-size:13px;color:#777;margin:0 0 12px">${b.placeLine}</p>` : "";
        const avatar = circleAvatarHtml(b.displayName, b.photoUrl, 96);
        const html = `<div style="text-align:center;padding:20px"><div style="margin-bottom:12px">${avatar}</div><div style="font-size:40px;margin-bottom:12px">🎂🌸🎉</div><h2 style="color:#2d6a4f;font-size:22px;margin:0 0 8px">Happy Birthday!</h2><p style="font-size:16px;color:#333;margin:0 0 4px">Dear <strong>${b.displayName}</strong>,</p>${placeHtml}<p style="font-size:14px;color:#555;line-height:1.7">${b.wish}</p><div style="background:#f0f8f0;border-radius:8px;padding:16px;margin:20px 0"><p style="color:#2d6a4f;font-weight:600;margin:0">With warm wishes from all members of TANHOWA</p></div></div>`;
        await sendDirectEmail(fromEmail, b.email, `Happy Birthday, ${b.displayName}! 🎂 - TANHOWA`, wrapEmail(html));
        await sleep(250);
        if (b.telegram_chat_id) {
          const placeTg = b.placeLine ? `<i>${b.placeLine}</i>\n\n` : "";
          const caption = `🎂🎉 <b>Happy Birthday, ${b.displayName}!</b>\n\n${placeTg}${b.wish}\n\n<i>With warm wishes from TANHOWA</i> 🌿`;
          let sentPhoto = false;
          if (isTrustedPhotoUrl(b.photoUrl)) {
            sentPhoto = await sendTelegramPhoto(b.telegram_chat_id, b.photoUrl, caption);
          }
          if (!sentPhoto) {
            await sendTelegram(b.telegram_chat_id, caption);
          }
          await sleep(100);
        }
      }
    }

    // ==================== FESTIVALS ====================
    const festival = FESTIVALS[mmdd];
    if (festival) {
      // Announcement first — before email/Telegram in case function times out.
      await supabase.from("announcements").insert({
        title: `${festival.emoji} ${festival.greeting}`,
        content: `${festival.message}\n\nWarm wishes from TANHOWA Family!\n\n🌿 Growing Together, Nurturing Tomorrow 🌿`,
        author_id: adminId,
        published: true,
      });

      if (!festival.announcementOnly) {
        const festHtml = `<div style="text-align:center;padding:20px"><div style="font-size:48px;margin-bottom:16px">${festival.emoji}</div><h2 style="color:#2d6a4f;font-size:24px;margin:0 0 12px">${festival.greeting}</h2><p style="font-size:14px;color:#555;line-height:1.7;max-width:400px;margin:0 auto 20px">${festival.message}</p><div style="background:#f0f8f0;border-radius:8px;padding:16px;margin:16px 0"><p style="color:#2d6a4f;font-weight:600;margin:0">Warm wishes from TANHOWA Family</p></div></div>`;
        await sendIndividually(fromEmail, allEmails, `${festival.emoji} ${festival.greeting} - TANHOWA`, wrapEmail(festHtml));

        // Telegram broadcast
        const { data: tgUsers } = await supabase
          .from("users")
          .select("telegram_chat_id")
          .eq("status", "approved")
          .not("telegram_chat_id", "is", null);
        for (const u of tgUsers || []) {
          if (u.telegram_chat_id) {
            await sendTelegram(u.telegram_chat_id, `${festival.emoji} <b>${festival.greeting}</b>\n\n${festival.message}\n\n<i>- TANHOWA Family</i> 🌿`);
            await sleep(100);
          }
        }
      }
    }
  } catch (error) {
    // Surface failures so /admin/error-logs flags them. The atomic claim row
    // for today is already in site_settings — operators can delete it and
    // re-trigger the cron, or run tools/daily_greetings.py --no-lock.
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: `triggerDailyGreetings failed: ${msg}`,
      stack: error instanceof Error ? error.stack : "",
      path: "/lib/daily-greetings",
      method: "INTERNAL",
      status_code: 500,
    });
  }
}
