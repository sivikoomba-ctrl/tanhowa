-- FAQ System - Database Schema
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  sort_order INTEGER DEFAULT 0,
  published BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faqs_category ON faqs(category);
CREATE INDEX IF NOT EXISTS idx_faqs_published ON faqs(published);
CREATE INDEX IF NOT EXISTS idx_faqs_sort ON faqs(sort_order);

ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
