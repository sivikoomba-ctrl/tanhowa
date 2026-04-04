-- Content translations table for auto-translating user-generated content (EN↔TA)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS content_translations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  field TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'ta',
  translated_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_table, source_id, field, lang)
);

CREATE INDEX IF NOT EXISTS idx_translations_lookup
  ON content_translations(source_table, source_id, lang);
