-- task_points.ref_type/ref_id already exist live in production (added via the
-- SQL editor for Field Diary gamification — see lib/task-points.ts) but were
-- never checked into a migration file. This documents + guarantees them
-- idempotently so a fresh environment matches production.
--
-- ref_type/ref_id generalize point-awarding beyond todo_id (which has a hard
-- FK into `todos` and can't be reused for other tables — e.g. a subscription
-- or expense_voucher id). See awardTaskPoints() in lib/task-points.ts.

ALTER TABLE task_points ADD COLUMN IF NOT EXISTS ref_type TEXT;
ALTER TABLE task_points ADD COLUMN IF NOT EXISTS ref_id UUID;

-- Idempotency for ref-based awards: never award the same (user, ref, reason)
-- twice — e.g. the same admin re-approving the same subscription.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_task_points_ref_award
  ON task_points(user_id, ref_type, ref_id, reason)
  WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL;
