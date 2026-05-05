-- Team privacy: hide a team from non-members.
-- Private teams are visible only to their members, admins, and officials.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark TT Team as private (top-level team working on policy matters).
UPDATE teams SET is_private = TRUE WHERE name = 'TT Team';
