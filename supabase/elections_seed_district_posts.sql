-- TANHOWA Election: seed one District Secretary + one District Joint Secretary
-- post for each of the 38 Tamil Nadu districts. Requires elections_district_schema.sql
-- (district column + UNIQUE(title, district)) to be applied first.
-- Idempotent — ON CONFLICT DO NOTHING against idx_election_posts_title_district.

INSERT INTO election_posts (title, district, display_order)
SELECT t.title, d.district, t.ord
FROM (VALUES
  ('District Secretary', 8),
  ('District Joint Secretary', 9)
) AS t(title, ord)
CROSS JOIN (VALUES
  ('Ariyalur'), ('Chengalpattu'), ('Chennai'), ('Coimbatore'), ('Cuddalore'),
  ('Dharmapuri'), ('Dindigul'), ('Erode'), ('Kallakurichi'), ('Kancheepuram'),
  ('Kanniyakumari'), ('Karur'), ('Krishnagiri'), ('Madurai'), ('Mayiladuthurai'),
  ('Nagapattinam'), ('Namakkal'), ('Nilgiris'), ('Perambalur'), ('Pudukkottai'),
  ('Ramanathapuram'), ('Ranipet'), ('Salem'), ('Sivaganga'), ('Tenkasi'),
  ('Thanjavur'), ('Theni'), ('Thoothukudi'), ('Tiruchirappalli'), ('Tirunelveli'),
  ('Tirupathur'), ('Tiruppur'), ('Tiruvallur'), ('Tiruvannamalai'), ('Tiruvarur'),
  ('Vellore'), ('Viluppuram'), ('Virudhunagar')
) AS d(district)
ON CONFLICT (title, COALESCE(district, '')) DO NOTHING;

-- Optional cleanup: remove the original district-less DS / DJS placeholder rows
-- (seeded before district support). Uncomment to run.
-- DELETE FROM election_posts
-- WHERE district IS NULL AND title IN ('District Secretary', 'District Joint Secretary');
