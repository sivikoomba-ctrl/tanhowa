-- Feedback collection — combines in-app widget, re-engagement modal, and
-- inactive-email submissions into a single table the AI summary can slice.

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
    -- 'widget' (floating button on dashboard pages)
    -- 're_engagement' (modal shown after 14+ day inactivity)
    -- 'inactive_email' (link clicked from inactive-nudge email)
  rating INTEGER,
    -- 1-5 stars; nullable for re_engagement / inactive_email
  reason TEXT,
    -- short canonical label e.g. 'busy_work' / 'not_useful' / 'tech_issues'
  comment TEXT,
  page_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_source ON feedback(source);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);

-- Track which members have already seen the re-engagement modal so we
-- don't keep showing it on every login. Keyed off users; a single row
-- per (user_id, kind) — see app/dashboard/layout.tsx logic.
CREATE TABLE IF NOT EXISTS feedback_prompts_shown (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  kind TEXT NOT NULL, -- 're_engagement' for now; future-proof
  shown_at TIMESTAMPTZ DEFAULT NOW(),
  responded BOOLEAN DEFAULT FALSE,
  UNIQUE (user_id, kind)
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_prompts_shown ENABLE ROW LEVEL SECURITY;
-- No permissive policies — service role bypasses RLS, anon has zero access.
