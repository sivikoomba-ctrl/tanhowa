-- TANHOWA History timeline (CMS-lite milestones curated by super-admin)
-- Run this once via the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS history_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_event_date ON history_entries(event_date DESC);

ALTER TABLE history_entries ENABLE ROW LEVEL SECURITY;
-- Note: no permissive policies — service role key (used by API routes) bypasses RLS.
-- Anon key has zero access, matching the project convention.
