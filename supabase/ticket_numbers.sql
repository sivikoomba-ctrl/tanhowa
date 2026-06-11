-- Year-scoped ticket numbers for grievances / suggestions / service requests
-- Format: GRV-2026-0001, SUG-2026-0001, SRQ-2026-0001 (counter resets each year)

ALTER TABLE grievances ADD COLUMN IF NOT EXISTS ticket_no TEXT UNIQUE;

-- Atomic per-prefix-per-year counters (race-safe via upsert)
CREATE TABLE IF NOT EXISTS ticket_counters (
  prefix TEXT NOT NULL,
  year INT NOT NULL,
  counter INT NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, year)
);

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

DROP TRIGGER IF EXISTS trg_assign_ticket_no ON grievances;
CREATE TRIGGER trg_assign_ticket_no
  BEFORE INSERT ON grievances
  FOR EACH ROW EXECUTE FUNCTION assign_ticket_no();

-- Backfill existing rows in created_at order, per type per year
WITH typed AS (
  SELECT id, created_at,
    CASE WHEN category = 'Suggestion' THEN 'SUG'
         WHEN category IN ('Transfer','Training','Legal Help','Certificate','Letter/Recommendation','Welfare','IT Support','Other Service') THEN 'SRQ'
         ELSE 'GRV' END AS p,
    EXTRACT(YEAR FROM created_at)::INT AS y
  FROM grievances WHERE ticket_no IS NULL
), ranked AS (
  SELECT id, p, y, ROW_NUMBER() OVER (PARTITION BY p, y ORDER BY created_at) AS rn
  FROM typed
)
UPDATE grievances g
SET ticket_no = r.p || '-' || r.y || '-' || LPAD(r.rn::TEXT, 4, '0')
FROM ranked r WHERE g.id = r.id;

-- Seed counters past the backfilled maximums
INSERT INTO ticket_counters (prefix, year, counter)
SELECT split_part(ticket_no, '-', 1),
       split_part(ticket_no, '-', 2)::INT,
       MAX(split_part(ticket_no, '-', 3)::INT)
FROM grievances WHERE ticket_no IS NOT NULL
GROUP BY 1, 2
ON CONFLICT (prefix, year) DO UPDATE SET counter = GREATEST(ticket_counters.counter, EXCLUDED.counter);
