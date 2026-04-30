import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import { logError } from "@/lib/error-logger";

// Vercel Cron — daily 09:30 IST (04:00 UTC)
// vercel.json: { "path": "/api/cron/stuck-tasks", "schedule": "0 4 * * *" }
// Detects tasks that look stuck and pings the committer + admins:
//   A) in_progress with no notes for 3+ days (silent task)
//   B) past due_date and not yet review/completed/rejected (overdue)
//   C) committed with timebox set and logged hours >= timebox (over budget)
// Atomic site_settings claim prevents double-runs from overlapping cron + manual triggers.

const CRON_SECRET = process.env.CRON_SECRET || "";
const SILENCE_DAYS = 3;

interface TodoRow {
  id: string;
  event_id: string;
  title: string;
  status: string;
  due_date: string | null;
  committed_by: string | null;
  committed_at: string | null;
  submitted_by: string | null;
  assigned_to: string | null;
  assigned_team_id: string | null;
  timebox_hours: number | null;
  updated_at: string | null;
}

interface StuckTask {
  todo: TodoRow;
  reasons: string[]; // human-readable bullet labels
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function runStuckDetector(): Promise<{ tasks_flagged: number; committers_notified: number; admins_notified: number }> {
  const supabase = getServiceClient();

  // Atomic claim of today's run (IST)
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const { error: claimErr } = await supabase
    .from("site_settings")
    .insert({ key: `stuck_tasks_run_${todayStr}`, value: "1" });
  if (claimErr) return { tasks_flagged: 0, committers_notified: 0, admins_notified: 0 };

  await supabase.from("site_settings").upsert(
    { key: "stuck_tasks_last_run", value: todayStr },
    { onConflict: "key" }
  );

  // 1) All currently active tasks
  const { data: activeTodos } = await supabase
    .from("todos")
    .select("id, event_id, title, status, due_date, committed_by, committed_at, submitted_by, assigned_to, assigned_team_id, timebox_hours, updated_at")
    .in("status", ["approved", "in_progress"])
    .is("parent_id", null);
  const todos: TodoRow[] = activeTodos || [];
  if (todos.length === 0) return { tasks_flagged: 0, committers_notified: 0, admins_notified: 0 };

  // 2) Latest note per todo (for silence detection)
  const todoIds = todos.map((t) => t.id);
  const lastNoteByTodoId: Record<string, string> = {};
  if (todoIds.length > 0) {
    const { data: notes } = await supabase
      .from("todo_notes")
      .select("todo_id, created_at")
      .in("todo_id", todoIds)
      .order("created_at", { ascending: false });
    for (const n of notes || []) {
      if (!lastNoteByTodoId[n.todo_id]) lastNoteByTodoId[n.todo_id] = n.created_at;
    }
  }

  // 3) Logged hours per todo (for timebox-exceeded detection)
  const timeboxedIds = todos.filter((t) => t.timebox_hours && t.timebox_hours > 0).map((t) => t.id);
  const hoursByTodoId: Record<string, number> = {};
  if (timeboxedIds.length > 0) {
    const { data: entries } = await supabase
      .from("todo_time_entries")
      .select("todo_id, hours")
      .in("todo_id", timeboxedIds);
    for (const e of entries || []) {
      hoursByTodoId[e.todo_id] = (hoursByTodoId[e.todo_id] || 0) + Number(e.hours || 0);
    }
  }

  // 4) Apply stuck criteria
  const silenceCutoff = now.getTime() - SILENCE_DAYS * 24 * 60 * 60 * 1000;
  const stuck: StuckTask[] = [];

  for (const t of todos) {
    const reasons: string[] = [];

    // A) Silent task: in_progress and no activity (notes) for 3+ days; fall back to committed_at/updated_at
    if (t.status === "in_progress") {
      const lastTouchIso = lastNoteByTodoId[t.id] || t.committed_at || t.updated_at;
      if (lastTouchIso) {
        const lastTouchMs = new Date(lastTouchIso).getTime();
        if (lastTouchMs < silenceCutoff) {
          const days = Math.floor((now.getTime() - lastTouchMs) / (24 * 60 * 60 * 1000));
          reasons.push(`Silent for ${days}d (no notes since ${fmtDate(lastTouchIso)})`);
        }
      }
    }

    // B) Past due and not finished
    if (t.due_date) {
      const due = new Date(t.due_date).getTime();
      if (due < now.getTime() && !["review", "completed", "rejected"].includes(t.status)) {
        const days = Math.floor((now.getTime() - due) / (24 * 60 * 60 * 1000));
        reasons.push(`Overdue by ${days}d (was due ${fmtDate(t.due_date)})`);
      }
    }

    // C) Timebox exceeded (only if committed)
    if (t.committed_by && t.timebox_hours && t.timebox_hours > 0) {
      const logged = hoursByTodoId[t.id] || 0;
      if (logged >= t.timebox_hours) {
        const pct = Math.round((logged / t.timebox_hours) * 100);
        reasons.push(`Timebox exceeded (${logged.toFixed(1)}/${t.timebox_hours}h, ${pct}%)`);
      }
    }

    if (reasons.length > 0) stuck.push({ todo: t, reasons });
  }

  if (stuck.length === 0) {
    return { tasks_flagged: 0, committers_notified: 0, admins_notified: 0 };
  }

  // 5) Per-committer DM (one consolidated message per user)
  const committerToStuck: Record<string, StuckTask[]> = {};
  for (const s of stuck) {
    const cid = s.todo.committed_by;
    if (!cid) continue;
    if (!committerToStuck[cid]) committerToStuck[cid] = [];
    committerToStuck[cid].push(s);
  }

  let committersNotified = 0;
  if (Object.keys(committerToStuck).length > 0) {
    const committerIds = Object.keys(committerToStuck);
    const { data: committers } = await supabase
      .from("users")
      .select("id, name, telegram_chat_id")
      .in("id", committerIds)
      .not("telegram_chat_id", "is", null);

    for (const u of committers || []) {
      const items = committerToStuck[u.id] || [];
      if (items.length === 0) continue;
      const firstName = u.name?.split(" ")[0] || "Member";
      let msg = `🚧 <b>Checking in, ${escapeHtml(firstName)}</b>\n\nA few of your tasks look stuck. Anything blocking?\n`;
      for (const s of items.slice(0, 5)) {
        msg += `\n• <b>${s.todo.event_id}</b> — ${escapeHtml(s.todo.title)}\n  <i>${escapeHtml(s.reasons.join("; "))}</i>`;
      }
      if (items.length > 5) msg += `\n\n<i>…and ${items.length - 5} more</i>`;
      msg += `\n\n<b>Quick replies:</b>\n`;
      msg += `<code>/done ET-XXX summary</code> — Submit for review\n`;
      msg += `<code>/blocked ET-XXX reason</code> — Report blocker\n`;
      msg += `<code>/update ET-XXX progress</code> — Add a quick update\n`;
      msg += `\n<a href="https://www.tanhowa.in/dashboard/todos">Open Tasks</a>`;
      try {
        await sendTelegramMessage(u.telegram_chat_id, msg);
        committersNotified++;
      } catch { /* silent */ }
    }
  }

  // 6) Admin digest
  let adminsNotified = 0;
  const { data: admins } = await supabase
    .from("users")
    .select("id, telegram_chat_id, role")
    .in("role", ["admin", "super_admin"])
    .not("telegram_chat_id", "is", null);

  if (admins && admins.length > 0) {
    // Resolve committer names for digest (best-effort)
    const allCommitterIds = [...new Set(stuck.map((s) => s.todo.committed_by).filter(Boolean) as string[])];
    const nameById: Record<string, string> = {};
    if (allCommitterIds.length > 0) {
      const { data: rows } = await supabase
        .from("users")
        .select("id, name")
        .in("id", allCommitterIds);
      for (const r of rows || []) nameById[r.id] = r.name || "—";
    }

    let digest = `🚧 <b>Stuck Tasks Digest — ${todayStr}</b>\n\n${stuck.length} task(s) need attention:\n`;
    for (const s of stuck.slice(0, 15)) {
      const owner = s.todo.committed_by ? nameById[s.todo.committed_by] || "—" : "<i>uncommitted</i>";
      digest += `\n• <b>${s.todo.event_id}</b> — ${escapeHtml(s.todo.title)}\n  Owner: ${escapeHtml(owner)}\n  <i>${escapeHtml(s.reasons.join("; "))}</i>`;
    }
    if (stuck.length > 15) digest += `\n\n<i>…and ${stuck.length - 15} more</i>`;
    digest += `\n\n<a href="https://www.tanhowa.in/admin/todos">Open Admin Tasks</a>`;

    for (const a of admins) {
      try {
        await sendTelegramMessage(a.telegram_chat_id, digest);
        adminsNotified++;
      } catch { /* silent */ }
    }
  }

  return { tasks_flagged: stuck.length, committers_notified: committersNotified, admins_notified: adminsNotified };
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

    const result = await runStuckDetector();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/cron/stuck-tasks", method: "GET", status_code: 500 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
