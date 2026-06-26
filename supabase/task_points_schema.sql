-- Task gamification: points ledger.
-- Each row is one points award for a member, tied (where applicable) to a task.
-- A member's total = SUM(points). Levels/leaderboard are derived from this table.

CREATE TABLE IF NOT EXISTS task_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  todo_id UUID REFERENCES todos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_points_user ON task_points(user_id);
CREATE INDEX IF NOT EXISTS idx_task_points_created ON task_points(created_at);

-- Idempotency: never award the same (user, task, reason) twice.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_task_points_award
  ON task_points(user_id, todo_id, reason) WHERE todo_id IS NOT NULL;

ALTER TABLE task_points ENABLE ROW LEVEL SECURITY;
