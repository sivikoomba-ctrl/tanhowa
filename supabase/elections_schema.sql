-- TANHOWA Election: posts (positions) and candidates
-- Visible only to super_admin and sivikoomba@gmail.com (enforced in API)

CREATE TABLE IF NOT EXISTS election_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | nominations_open | voting_open | closed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS election_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES election_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  district TEXT,
  statement TEXT,
  status TEXT NOT NULL DEFAULT 'nominated', -- nominated | approved | withdrawn
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_election_candidates_post ON election_candidates(post_id);

ALTER TABLE election_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE election_candidates ENABLE ROW LEVEL SECURITY;

-- Seed standard association posts (no-op on re-run)
INSERT INTO election_posts (title, display_order) VALUES
  ('President', 1),
  ('Vice President', 2),
  ('General Secretary', 3),
  ('Joint General Secretary', 4),
  ('Treasurer', 5),
  ('Joint Treasurer', 6),
  ('Organising Secretary', 7),
  ('District Secretary', 8),
  ('District Joint Secretary', 9)
ON CONFLICT (title) DO NOTHING;
