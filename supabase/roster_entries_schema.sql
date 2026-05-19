-- District Roster — manual entries for officers not yet registered on the portal.
-- The /admin/roster page renders the UNION of approved users + these rows, grouped by district.
CREATE TABLE IF NOT EXISTS roster_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  designation TEXT,
  district TEXT NOT NULL,
  block TEXT,
  phone TEXT,
  email TEXT,
  added_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE roster_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_roster_district ON roster_entries(district);
CREATE INDEX IF NOT EXISTS idx_roster_phone ON roster_entries(phone);
CREATE INDEX IF NOT EXISTS idx_roster_email ON roster_entries(email);
