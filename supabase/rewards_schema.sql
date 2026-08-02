-- Rewards Redemption: catalog + redemption request queue on top of the existing
-- task_points ledger (see lib/task-points.ts). No new "balance" column anywhere —
-- a member's spendable balance is still just SUM(task_points.points); an approved
-- redemption debits it by inserting a negative task_points row (reason
-- 'reward_redeemed', ref_type 'reward_redemption'), so /api/gamification, the
-- leaderboard, and levels all reflect redemptions automatically.

CREATE TABLE IF NOT EXISTS rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  points_cost INTEGER NOT NULL CHECK (points_cost > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Nullable + SET NULL so deleting a catalog item never breaks redemption
  -- history — reward_title/points_cost below are a snapshot at request time.
  reward_id UUID REFERENCES rewards(id) ON DELETE SET NULL,
  reward_title TEXT NOT NULL,
  points_cost INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  remarks TEXT NOT NULL DEFAULT '',
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_user ON reward_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_status ON reward_redemptions(status);

ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_redemptions ENABLE ROW LEVEL SECURITY;
