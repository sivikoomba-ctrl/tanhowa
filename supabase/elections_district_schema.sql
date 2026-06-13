-- TANHOWA Election: district-scope posts so multiple DS / DJS positions can coexist.
-- Adds election_posts.district and replaces UNIQUE(title) with UNIQUE(title, district).
-- Idempotent — safe to re-run.

ALTER TABLE election_posts ADD COLUMN IF NOT EXISTS district TEXT;

-- Drop the old title-only uniqueness (auto-named when title was declared UNIQUE).
ALTER TABLE election_posts DROP CONSTRAINT IF EXISTS election_posts_title_key;

-- New uniqueness: one post per (title, district). State posts keep district NULL,
-- coalesced to '' so they stay unique while many DS/DJS rows differ by district.
CREATE UNIQUE INDEX IF NOT EXISTS idx_election_posts_title_district
  ON election_posts (title, COALESCE(district, ''));
