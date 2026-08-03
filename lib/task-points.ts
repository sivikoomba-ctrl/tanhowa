// Task gamification — points engine, levels, and the award helper.
// Points are stored in the `task_points` ledger (supabase/task_points_schema.sql).
import { getServiceClient } from "@/lib/supabase";

export const TASK_POINTS = {
  first_task: 15,        // one-time, first task a member ever creates
  commit: 5,             // committing to a task
  deliverable: 5,        // uploading a deliverable file
  time_log: 2,           // logging a time entry
  subtask_completed: 8,  // a sub-task marked completed
  task_completed: 20,    // a top-level task marked completed
  on_time_bonus: 10,     // completed on/before its due date
  diary_entry: 10,       // submitted a daily field diary entry
  diary_success_story: 15, // a diary entry's AI-drafted success story was published
  reward_redeemed: 0,    // always used with a negative overridePoints — see /api/reward-redemptions
  finance_payment_verified: 3, // Finance Team: final approval of a subscription payment
  finance_payment_rejected: 2, // Finance Team: rejected a subscription payment
  finance_voucher_reviewed: 3, // Finance Team: approved or rejected an expense voucher
} as const;

export type PointReason = keyof typeof TASK_POINTS;

export const REASON_LABELS: Record<string, string> = {
  first_task: "First task created",
  commit: "Committed to a task",
  deliverable: "Uploaded a deliverable",
  time_log: "Logged time",
  subtask_completed: "Completed a sub-task",
  task_completed: "Completed a task",
  on_time_bonus: "On-time completion bonus",
  diary_entry: "Submitted a field diary entry",
  diary_success_story: "Field diary success story published",
  reward_redeemed: "Reward redeemed",
  finance_payment_verified: "Verified a payment",
  finance_payment_rejected: "Rejected a payment",
  finance_voucher_reviewed: "Reviewed an expense voucher",
};

export const LEVELS = [
  { name: "Sprout", emoji: "🌱", min: 0 },
  { name: "Gardener", emoji: "🌿", min: 100 },
  { name: "Cultivator", emoji: "🪴", min: 300 },
  { name: "Horticulturist", emoji: "🌳", min: 700 },
  { name: "Master Horticulturist", emoji: "🏆", min: 1500 },
] as const;

export function getLevel(points: number) {
  let current: (typeof LEVELS)[number] = LEVELS[0];
  for (const l of LEVELS) if (points >= l.min) current = l;
  const index = LEVELS.indexOf(current);
  const next = LEVELS[index + 1] || null;
  const span = next ? next.min - current.min : 1;
  const into = points - current.min;
  return {
    name: current.name,
    emoji: current.emoji,
    index,
    next: next ? { name: next.name, emoji: next.emoji, min: next.min } : null,
    pointsToNext: next ? Math.max(0, next.min - points) : 0,
    progressPct: next ? Math.min(100, Math.round((into / span) * 100)) : 100,
  };
}

/**
 * Award points to a member, idempotently. The unique index on
 * (user_id, todo_id, reason) prevents double-awarding the same task event;
 * conflict errors are swallowed. Fire-and-forget — never blocks the caller.
 *
 * For events tied to a non-todo entity (e.g. a field diary entry), pass `ref`
 * instead of `todoId` — `todo_id` has a hard FK into `todos` and cannot be
 * reused for other tables. `ref` is deduped via a separate unique index on
 * (user_id, ref_type, ref_id, reason).
 */
export async function awardTaskPoints(
  userId: string | null | undefined,
  reason: PointReason,
  todoId?: string | null,
  overridePoints?: number,
  ref?: { type: string; id: string },
): Promise<void> {
  if (!userId) return;
  const points = overridePoints ?? TASK_POINTS[reason];
  if (!points) return;
  try {
    const supabase = getServiceClient();
    // first_task has no todo-based dedup across tasks — guard it explicitly
    if (reason === "first_task") {
      const { count } = await supabase
        .from("task_points")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("reason", "first_task");
      if ((count || 0) > 0) return;
    }
    await supabase.from("task_points").insert({
      user_id: userId,
      points,
      reason,
      todo_id: todoId || null,
      ref_type: ref?.type || null,
      ref_id: ref?.id || null,
    });
  } catch {
    /* ignore — includes unique-conflict dedup */
  }
}
