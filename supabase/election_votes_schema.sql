-- TANHOWA Election voting — secret ballot, one vote per member per post.
-- voter_id is stored only to enforce uniqueness / allow vote change; tallies never expose it.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS election_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES election_posts(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES election_candidates(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_election_votes_post ON election_votes(post_id);
CREATE INDEX IF NOT EXISTS idx_election_votes_candidate ON election_votes(candidate_id);

ALTER TABLE election_votes ENABLE ROW LEVEL SECURITY;
