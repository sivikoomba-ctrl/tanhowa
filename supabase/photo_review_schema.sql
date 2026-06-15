-- Profile Photo Review & Lock
-- Adds moderation/lock state to users.photo_url.
-- Idempotent: safe to re-apply.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS photo_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS photo_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS photo_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS photo_review_note TEXT,
  ADD COLUMN IF NOT EXISTS photo_quality JSONB;

-- photo_status: 'pending' (awaiting human review) | 'approved' (locked) | 'rejected' (re-upload requested)
-- photo_quality: AI verdict, e.g. { "score": 0-100, "verdict": "good|borderline|poor",
--                                   "issues": ["blurry","low_resolution",...], "reason": "...",
--                                   "scored_at": "ISO", "auto_rejected": true }

-- Index for the review queue (pending photos first, oldest scored first)
CREATE INDEX IF NOT EXISTS idx_users_photo_status ON users(photo_status) WHERE photo_url IS NOT NULL;
