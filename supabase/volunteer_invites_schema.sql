-- Volunteer Admin invite/consent tracking
CREATE TABLE IF NOT EXISTS volunteer_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES users(id),
  district TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

-- One pending invite per user at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteer_invites_pending
  ON volunteer_invites (user_id) WHERE status = 'pending';

-- Quick lookup by user
CREATE INDEX IF NOT EXISTS idx_volunteer_invites_user ON volunteer_invites (user_id);
