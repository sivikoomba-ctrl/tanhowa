-- DC Representation: tracks whether each district's representation letter has
-- been delivered to the District Collector, DDH, and JDA. Self-reported by
-- the district's DS/DJS, rolled up for the State-Admin at /admin/dc-representation.

CREATE TABLE IF NOT EXISTS dc_representation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district TEXT NOT NULL,
  office TEXT NOT NULL CHECK (office IN ('District Collector', 'DDH', 'JDA')),
  status TEXT NOT NULL DEFAULT 'not_given' CHECK (status IN ('given', 'not_given')),
  date_given DATE,
  remarks TEXT,
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (district, office)
);

CREATE INDEX IF NOT EXISTS idx_dc_representation_district ON dc_representation(district);
CREATE INDEX IF NOT EXISTS idx_dc_representation_status ON dc_representation(status);

ALTER TABLE dc_representation ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION touch_dc_representation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_dc_representation ON dc_representation;
CREATE TRIGGER trg_touch_dc_representation
  BEFORE UPDATE ON dc_representation
  FOR EACH ROW EXECUTE FUNCTION touch_dc_representation_updated_at();

-- Media junction table: the letter document + event photos, one row per file.
CREATE TABLE IF NOT EXISTS dc_representation_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES dc_representation(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('letter', 'photo')),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dc_representation_media_entry ON dc_representation_media(entry_id);
ALTER TABLE dc_representation_media ENABLE ROW LEVEL SECURITY;
