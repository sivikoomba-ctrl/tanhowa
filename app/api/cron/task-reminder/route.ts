import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import { logError } from "@/lib/error-logger";

// Vercel Cron — daily 06:00 IST (00:30 UTC)
// vercel.json: { "path": "/api/cron/task-reminder", "schedule": "30 0 * * *" }
// Reminds Telegram-linked members about tasks that need attention:
//   - due within 2 days, OR
//   - they have committed and timebox is 75%+ consumed
// Uses an atomic dated-key claim in site_settings so manual + cron callers don't double-send.

const CRON_SECRET = process.env.CRON_SECRET || "";

interface TodoRow {
  id: string;
  event_id: string;
  title: string;
  status: string;
  due_date: string | null;
  committed_by: string | null;
  assigned_to: string | null;
  assigned_team_id: string | null;
  timebox_hours: number | null;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function runTaskReminders(): Promise<{ users_notified: number; tasks_flagged: number }> {
  const supabase = getServiceClient();

  // Atomic claim of today's run (IST)
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const { error: claimErr } = await supabase
    .from("site_settings")
    .insert({ key: `task_reminder_run_${todayStr}`, value: "1" });
  if (claimErr) return { users_notified: 0, tasks_flagged: 0 };

  await supabase.from("site_settings").upsert({
    key: "task_reminder_last_run",
    value: todayStr,
  }, { onConflict: "key" });

  // 1) Collect Telegram-linked approved members
  const { data: linkedUsers } = await supabase
    .from("users")
    .select("id, name, telegram_chat_id")
    .eq("status", "approved")
    .not("telegram_chat_id", "is", null);

  if (!linkedUsers || linkedUsers.length === 0) {
    return { users_notified: 0, tasks_flagged: 0 };
  }

  // 2) Pull all active tasks once and bucket per-user in JS (cheaper than N round-trips)
  const { data: activeTodos } = await supabase
    .from("todos")
    .select("id, event_id, title, status, due_date, committed_by, assigned_to, assigned_team_id, timebox_hours")
    .in("status", ["approved", "in_progress"])
    .is("parent_id", null);
  const todos: TodoRow[] = activeTodos || [];

  if (todos.length === 0) {
    return { users_notified: 0, tasks_flagged: 0 };
  }

  // 3) Sum logged hours per todo (only for tasks with a timebox set)
  const timeboxedTodoIds = todos.filter((t) => t.timebox_hours && t.timebox_hours > 0).map((t) => t.id);
  const hoursByTodoId: Record<string, number> = {};
  if (timeboxedTodoIds.length > 0) {
    const { data: entries } = await supabase
      .from("todo_time_entries")
      .select("todo_id, hours")
      .in("todo_id", timeboxedTodoIds);
    for (const e of entries || []) {
      hoursByTodoId[e.todo_id] = (hoursByTodoId[e.todo_id] || 0) + Number(e.hours || 0);
    }
  }

  // 4) Map team_id → user_ids for fast team lookup
  const teamIds = [...new Set(todos.filter((t) => t.assigned_team_id).map((t) => t.assigned_team_id as string))];
  const teamMembersByTeam: Record<string, string[]> = {};
  if (teamIds.length > 0) {
    const { data: teamRows } = await supabase
      .from("team_members")
      .select("team_id, user_id")
      .in("team_id", teamIds);
    for (const r of teamRows || []) {
      const list = teamMembersByTeam[r.team_id] || [];
      list.push(r.user_id);
      teamMembersByTeam[r.team_id] = list;
    }
  }

  // 5) Cutoffs
  const dueCutoff = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // +2 days

  let usersNotified = 0;
  let tasksFlagged = 0;

  for (const u of linkedUsers as { id: string; name: string | null; telegram_chat_id: string }[]) {
    const dueSoon: TodoRow[] = [];
    const timeboxHot: { todo: TodoRow; pct: number; logged: number }[] = [];

    for (const t of todos) {
      const isAssignee = t.assigned_to === u.id;
      const isCommitter = t.committed_by === u.id;
      const isTeamMember = t.assigned_team_id ? (teamMembersByTeam[t.assigned_team_id] || []).includes(u.id) : false;
      const isMine = isAssignee || isCommitter || isTeamMember;
      if (!isMine) continue;

      // Bucket A: due within 2 days
      if (t.due_date) {
        const due = new Date(t.due_date);
        if (due.getTime() <= dueCutoff.getTime()) {
          dueSoon.push(t);
          continue;
        }
      }

      // Bucket B: committed by user AND timebox ≥75% consumed
      if (isCommitter && t.timebox_hours && t.timebox_hours > 0) {
        const logged = hoursByTodoId[t.id] || 0;
        const pct = (logged / t.timebox_hours) * 100;
        if (pct >= 75) {
          timeboxHot.push({ todo: t, pct, logged });
        }
      }
    }

    if (dueSoon.length === 0 && timeboxHot.length === 0) continue;

    // Compose digest
    const firstName = u.name?.split(" ")[0] || "Member";
    let msg = `🔔 <b>Task reminders for ${escapeHtml(firstName)}</b>\n`;

    if (dueSoon.length > 0) {
      msg += `\n⚠️ <b>Due soon:</b>\n`;
      for (const t of dueSoon.slice(0, 5)) {
        const dueLabel = t.due_date ? new Date(t.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "no date";
        msg += `• <b>${t.event_id}</b> — ${escapeHtml(t.title)} <i>(${dueLabel})</i>\n`;
      }
      if (dueSoon.length > 5) msg += `<i>…and ${dueSoon.length - 5} more</i>\n`;
    }

    if (timeboxHot.length > 0) {
      msg += `\n🕒 <b>Timebox running out:</b>\n`;
      for (const h of timeboxHot.slice(0, 5)) {
        const t = h.todo;
        const cap = t.timebox_hours as number;
        msg += `• <b>${t.event_id}</b> — ${escapeHtml(t.title)} <i>(${h.logged.toFixed(1)}/${cap}h, ${Math.round(h.pct)}%)</i>\n`;
      }
      if (timeboxHot.length > 5) msg += `<i>…and ${timeboxHot.length - 5} more</i>\n`;
    }

    msg += `\n<b>Quick replies:</b>\n`;
    msg += `<code>/commit ET-XXX 4</code> — Commit with 4h timebox\n`;
    msg += `<code>/done ET-XXX</code> — Submit for review\n`;
    msg += `<code>/blocked ET-XXX reason</code> — Report blocker\n`;
    msg += `\n<a href="https://www.tanhowa.in/dashboard/todos">Open Tasks</a>`;

    try {
      await sendTelegramMessage(u.telegram_chat_id, msg);
      usersNotified++;
      tasksFlagged += dueSoon.length + timeboxHot.length;
    } catch { /* silent — chat may be blocked */ }
  }

  return { users_notified: usersNotified, tasks_flagged: tasksFlagged };
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

    const result = await runTaskReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/cron/task-reminder", method: "GET", status_code: 500 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
