-- Fixes from code review 2026-06-12:
-- 1. Snapshot the submitter's district onto the grievance row at insert time.
--    District admins filter on grievances.district instead of joining the
--    submitter's CURRENT posting_details — rows no longer vanish from district
--    queues when a profile changes, and posting_details is no longer echoed
--    in the API payload.
-- 2. Ticket year computed in IST (was UTC: submissions 00:00-05:30 IST on
--    Jan 1 got the previous year's prefix and counter).

ALTER TABLE grievances ADD COLUMN IF NOT EXISTS district TEXT;

CREATE OR REPLACE FUNCTION assign_grievance_district()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.district IS NULL THEN
    NEW.district := (SELECT posting_details->>'regular_district' FROM users WHERE id = NEW.submitted_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_grievance_district ON grievances;
CREATE TRIGGER trg_assign_grievance_district
  BEFORE INSERT ON grievances
  FOR EACH ROW EXECUTE FUNCTION assign_grievance_district();

-- Backfill the snapshot for existing rows
UPDATE grievances g
SET district = u.posting_details->>'regular_district'
FROM users u
WHERE u.id = g.submitted_by AND g.district IS NULL;

CREATE INDEX IF NOT EXISTS idx_grievances_district ON grievances(district);

-- Ticket year in IST. Same function as supabase/ticket_numbers.sql otherwise.
CREATE OR REPLACE FUNCTION assign_ticket_no()
RETURNS TRIGGER AS $$
DECLARE
  p TEXT;
  y INT := EXTRACT(YEAR FROM (COALESCE(NEW.created_at, NOW()) AT TIME ZONE 'Asia/Kolkata'))::INT;
  n INT;
BEGIN
  IF NEW.ticket_no IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.category = 'Suggestion' THEN p := 'SUG';
  ELSIF NEW.category IN ('Transfer','Training','Legal Help','Certificate','Letter/Recommendation','Welfare','IT Support','Other Service') THEN p := 'SRQ';
  ELSE p := 'GRV';
  END IF;
  INSERT INTO ticket_counters (prefix, year, counter) VALUES (p, y, 1)
  ON CONFLICT (prefix, year) DO UPDATE SET counter = ticket_counters.counter + 1
  RETURNING counter INTO n;
  NEW.ticket_no := p || '-' || y || '-' || LPAD(n::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
