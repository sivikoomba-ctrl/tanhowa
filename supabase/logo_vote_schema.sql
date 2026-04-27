-- ============================================================
-- LOGO VOTE SCHEMA
-- Run this in the Supabase SQL Editor (one-time setup).
-- Cleans up any prior install, creates fresh tables, seeds the
-- 6 concepts, and opens a 7-day voting window.
-- ============================================================

-- Concepts that members are voting on
create table if not exists logo_concepts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  blurb text,
  image_url text not null,
  sort_order int default 0,
  active boolean default true,
  created_at timestamptz default now()
);

-- One vote per member; can be changed any time before voting closes
create table if not exists logo_votes (
  user_id uuid primary key references users(id) on delete cascade,
  concept_id uuid not null references logo_concepts(id) on delete cascade,
  voted_at timestamptz default now()
);
create index if not exists logo_votes_concept_idx on logo_votes(concept_id);

-- One feedback comment per member; editable
create table if not exists logo_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  concept_id uuid references logo_concepts(id) on delete set null,
  comment text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);
create index if not exists logo_comments_created_idx on logo_comments(created_at desc);

-- RLS: anon key has no access; all reads/writes go through service role
alter table logo_concepts enable row level security;
alter table logo_votes    enable row level security;
alter table logo_comments enable row level security;

-- Seed the 6 concepts
insert into logo_concepts (slug, name, blurb, image_url, sort_order) values
  ('bloom',          'Bloom',          'Five vibrant leaf-petals radiating from a glowing sun-orange center.',                  '/logos/concept-bloom.svg',           1),
  ('sprout-t',       'Sprout T',       'The letter T reformed as a sprouting plant — trunk, two arched leaves, brass bud.',    '/logos/concept-01-sprout-T.svg',     2),
  ('heraldic-shield','Heraldic Shield','Classic government-style shield with a gold banner and a central leaf.',                '/logos/concept-02-heraldic-shield.svg', 3),
  ('monogram-t',     'Monogram T',     'Bold gold T inside a forest-green seal with leaf flourishes flanking the crossbar.',   '/logos/concept-03-monogram-T.svg',   4),
  ('laurel-wreath',  'Laurel Wreath',  'Two laurel branches around a T monogram, gold star on top, ribbon at the base.',       '/logos/concept-04-laurel-wreath.svg', 5),
  ('modern-crest',   'Modern Crest',   'Geometric hex-crest with a detailed central leaf and dotted brass border.',             '/logos/concept-05-modern-crest.svg', 6)
on conflict (slug) do update
  set name = excluded.name,
      blurb = excluded.blurb,
      image_url = excluded.image_url,
      sort_order = excluded.sort_order,
      active = true;

-- Open a 7-day voting window
insert into site_settings (key, value) values
  ('logo_vote_open',     'true'),
  ('logo_vote_started_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  ('logo_vote_ends_at',    to_char((now() + interval '7 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
on conflict (key) do update set value = excluded.value;
