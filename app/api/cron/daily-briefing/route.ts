import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { sendTelegramMessageWithKeyboard, type InlineKeyboard } from "@/lib/telegram";
import { logError } from "@/lib/error-logger";
import { getGemini } from "@/lib/gemini";

// Vercel Cron — daily 05:30 IST (00:00 UTC)
// vercel.json: { "path": "/api/cron/daily-briefing", "schedule": "0 0 * * *" }
// Sends each Telegram-linked member a personalized morning briefing with
// inline-keyboard action buttons for their top 3 active tasks.
// Buttons are wired in the Telegram webhook (callback_query handler):
//   - ✅ ET-XXX → calls handleDone (submit for review)
//   - 🚧 ET-XXX → force_reply prompt → handleBlocked
//   - 📝 ET-XXX → force_reply prompt → handleAddNote (update)
// Atomic claim via site_settings key daily_briefing_run_{YYYY-MM-DD}.

const CRON_SECRET = process.env.CRON_SECRET || "";
const TOP_N = 3;

interface TodoLite {
  id: string;
  event_id: string;
  title: string;
  status: string;
  urgent: boolean;
  important: boolean;
  due_date: string | null;
  committed_by: string | null;
  assigned_to: string | null;
  assigned_team_id: string | null;
}

function quadrantScore(u: boolean, i: boolean): number {
  if (u && i) return 4;
  if (!u && i) return 3;
  if (u && !i) return 2;
  return 1;
}

function quadrantLabel(u: boolean, i: boolean): string {
  if (u && i) return "Do First";
  if (!u && i) return "Schedule";
  if (u && !i) return "Delegate";
  return "Eliminate";
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDueDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function generateBriefing(firstName: string, tasks: TodoLite[]): Promise<string> {
  const fallback = () => {
    const top = tasks[0];
    return `Good morning, ${firstName}! You have ${tasks.length} active task${tasks.length === 1 ? "" : "s"} today.${top ? ` Top priority: ${top.event_id}.` : ""} Let's make it a productive day.`;
  };

  if (!process.env.GOOGLE_GEMINI_API_KEY || tasks.length === 0) {
    return fallback();
  }

  try {
    const model = getGemini().getGenerativeModel({ model: "gemini-2.5-flash" });
    const taskSummary = tasks
      .slice(0, 5)
      .map((t, i) => {
        const q = quadrantLabel(t.urgent, t.important);
        const due = t.due_date ? `, due ${fmtDueDate(t.due_date)}` : "";
        return `${i + 1}. ${t.event_id}: ${t.title} (${q}${due})`;
      })
      .join("\n");

    const prompt = `You are a friendly task coach for TANHOWA (Tamil Nadu Horticultural Officers Welfare Association).

Generate a SHORT 2-3 sentence morning briefing for ${firstName}. Focus on what to tackle first based on the Eisenhower priority shown. Be warm but professional. Do NOT list the tasks — they are shown separately. End with a brief rallying line. Plain text only, no markdown, no emojis at the start.

Today's tasks:
${taskSummary}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    if (!text || text.length > 600) return fallback();
    return text;
  } catch {
    return fallback();
  }
}

async function runDailyBriefing(): Promise<{ users_briefed: number; tasks_surfaced: number }> {
  const supabase = getServiceClient();

  // Atomic claim of today's run (IST)
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const { error: claimErr } = await supabase
    .from("site_settings")
    .insert({ key: `daily_briefing_run_${todayStr}`, value: "1" });
  if (claimErr) return { users_briefed: 0, tasks_surfaced: 0 };

  await supabase.from("site_settings").upsert(
    { key: "daily_briefing_last_run", value: todayStr },
    { onConflict: "key" }
  );

  // 1) Telegram-linked approved members
  const { data: linkedUsers } = await supabase
    .from("users")
    .select("id, name, telegram_chat_id")
    .eq("status", "approved")
    .not("telegram_chat_id", "is", null);

  if (!linkedUsers || linkedUsers.length === 0) {
    return { users_briefed: 0, tasks_surfaced: 0 };
  }

  // 2) Active tasks (one query, bucket per user in JS)
  const { data: activeTodos } = await supabase
    .from("todos")
    .select("id, event_id, title, status, urgent, important, due_date, committed_by, assigned_to, assigned_team_id")
    .in("status", ["approved", "in_progress"])
    .is("parent_id", null);
  const todos: TodoLite[] = activeTodos || [];

  if (todos.length === 0) {
    return { users_briefed: 0, tasks_surfaced: 0 };
  }

  let usersBriefed = 0;
  let tasksSurfaced = 0;

  for (const u of linkedUsers as { id: string; name: string | null; telegram_chat_id: string }[]) {
    // Strictly the user's OWN tasks: assigned to them or already committed by them.
    // Team-assigned tasks are intentionally excluded so admins/super_admins on many
    // teams don't get every member's work in their morning briefing.
    const mine = todos.filter((t) => {
      if (t.assigned_to === u.id) return true;
      if (t.committed_by === u.id) return true;
      return false;
    });

    if (mine.length === 0) continue;

    // Sort: quadrant desc → in_progress before approved → due_date asc
    mine.sort((a, b) => {
      const qd = quadrantScore(b.urgent, b.important) - quadrantScore(a.urgent, a.important);
      if (qd !== 0) return qd;
      const ap = a.status === "in_progress" ? 0 : 1;
      const bp = b.status === "in_progress" ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const at = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      const bt = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      return at - bt;
    });

    const top = mine.slice(0, TOP_N);
    const firstName = u.name?.split(" ")[0] || "Member";
    const briefing = await generateBriefing(firstName, top);

    // Compose body
    let body = `🌿 <b>Good morning, ${escapeHtml(firstName)}</b>\n\n${escapeHtml(briefing)}\n\n📋 <b>Today's priorities</b>\n`;
    top.forEach((t, i) => {
      const q = quadrantLabel(t.urgent, t.important);
      const due = t.due_date ? ` · due ${fmtDueDate(t.due_date)}` : "";
      const statusEmoji = t.status === "in_progress" ? "🔄" : "✅";
      body += `\n${i + 1}. ${statusEmoji} <b>${t.event_id}</b> — ${escapeHtml(t.title)}\n   <i>${q}${due}</i>`;
    });
    body += `\n\nTap a button below, or reply with <code>/done</code>, <code>/blocked</code>, <code>/update</code>.\n<a href="https://www.tanhowa.in/dashboard/todos">Open Tasks</a>`;

    // Build inline keyboard: one row of action buttons per task
    const keyboard: InlineKeyboard = top.map((t) => [
      { text: `✅ ${t.event_id}`, callback_data: `done:${t.event_id}` },
      { text: `🚧 ${t.event_id}`, callback_data: `blocked:${t.event_id}` },
      { text: `📝 ${t.event_id}`, callback_data: `update:${t.event_id}` },
    ]);

    try {
      await sendTelegramMessageWithKeyboard(u.telegram_chat_id, body, keyboard);
      usersBriefed++;
      tasksSurfaced += top.length;
    } catch { /* silent — chat may be blocked */ }
  }

  return { users_briefed: usersBriefed, tasks_surfaced: tasksSurfaced };
}

export async function GET(req: NextRequest) {
  try {
    if (!CRON_SECRET) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runDailyBriefing();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/cron/daily-briefing", method: "GET", status_code: 500 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
