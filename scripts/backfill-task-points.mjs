// Backfill task_points from historical task activity so the gamification
// leaderboard isn't empty at launch. Idempotent — skips awards that already
// exist (keyed by user_id|todo_id|reason). Run AFTER applying
// supabase/task_points_schema.sql.
//
//   node scripts/backfill-task-points.mjs            (dry-run, default)
//   node scripts/backfill-task-points.mjs --execute  (insert)

process.loadEnvFile(".env.local");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const EXECUTE = process.argv.includes("--execute");

const POINTS = { first_task: 15, commit: 5, deliverable: 5, time_log: 2, subtask_completed: 8, task_completed: 20, on_time_bonus: 10 };

async function pageAll(path) {
  let rows = [], from = 0;
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/${path}${path.includes("?") ? "&" : "?"}limit=1000&offset=${from}`, { headers: H });
    if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
    const d = await r.json();
    rows = rows.concat(d);
    if (d.length < 1000) break;
    from += 1000;
  }
  return rows;
}

const main = async () => {
  const todos = await pageAll("todos?select=id,parent_id,status,committed_by,assigned_to,submitted_by,due_date,completed_at,created_at");
  const attachments = await pageAll("todo_attachments?select=user_id,todo_id");
  const timeEntries = await pageAll("todo_time_entries?select=user_id,todo_id");
  const existing = await pageAll("task_points?select=user_id,todo_id,reason");

  const seen = new Set(existing.map((e) => `${e.user_id}|${e.todo_id}|${e.reason}`));
  const out = [];
  const add = (user_id, reason, todo_id) => {
    if (!user_id) return;
    const key = `${user_id}|${todo_id}|${reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ user_id, points: POINTS[reason], reason, todo_id });
  };

  // first_task: earliest top-level task per submitter
  const earliest = new Map();
  for (const t of todos) {
    if (t.parent_id || !t.submitted_by) continue;
    const cur = earliest.get(t.submitted_by);
    if (!cur || (t.created_at || "") < (cur.created_at || "")) earliest.set(t.submitted_by, t);
  }
  for (const [uid, t] of earliest) add(uid, "first_task", t.id);

  for (const t of todos) {
    const worker = t.committed_by || t.assigned_to || t.submitted_by;
    if (t.committed_by) add(t.committed_by, "commit", t.id);
    if (t.status === "completed") {
      if (t.parent_id) {
        add(worker, "subtask_completed", t.id);
      } else {
        add(worker, "task_completed", t.id);
        if (t.due_date) {
          const done = (t.completed_at || t.created_at || "").slice(0, 10);
          if (done && done <= String(t.due_date).slice(0, 10)) add(worker, "on_time_bonus", t.id);
        }
      }
    }
  }

  for (const a of attachments) add(a.user_id, "deliverable", a.todo_id);
  for (const e of timeEntries) add(e.user_id, "time_log", e.todo_id);

  // Summary
  const byReason = {};
  let totalPts = 0;
  for (const r of out) { byReason[r.reason] = (byReason[r.reason] || 0) + 1; totalPts += r.points; }
  console.log(`New awards to insert: ${out.length}  (total ${totalPts} pts)`);
  for (const [k, v] of Object.entries(byReason).sort()) console.log(`  ${String(v).padStart(5)}  ${k}`);

  if (!EXECUTE) { console.log("\nDry-run. Re-run with --execute to insert."); return; }
  if (out.length === 0) { console.log("Nothing to insert."); return; }

  for (let i = 0; i < out.length; i += 500) {
    const batch = out.slice(i, i + 500);
    const r = await fetch(`${URL}/rest/v1/task_points`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal,resolution=ignore-duplicates" },
      body: JSON.stringify(batch),
    });
    if (!r.ok) { console.error("Insert error:", r.status, await r.text()); break; }
    console.log(`Inserted ${Math.min(i + 500, out.length)}/${out.length}`);
  }
  console.log("Done.");
};

main().catch((e) => { console.error(e); process.exit(1); });
