-- Tanhowa Horticulture Community - Database Schema
-- Run this in your Supabase SQL Editor

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  phone TEXT,
  photo_url TEXT,
  address TEXT,
  dob DATE,
  occupation TEXT,
  social_links JSONB DEFAULT '{}',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OTP codes table
CREATE TABLE otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Announcements table
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events table
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  date TIMESTAMPTZ NOT NULL,
  location TEXT,
  image_url TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Site settings table
CREATE TABLE site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO site_settings (key, value) VALUES
  ('community_name', 'Tanhowa'),
  ('tagline', 'Horticulture Community'),
  ('about', 'Connecting plant enthusiasts, gardeners, and horticulture professionals.');

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_otp_email ON otp_codes(email);
CREATE INDEX idx_announcements_published ON announcements(published);
CREATE INDEX idx_events_date ON events(date);

-- Users posting details (added after initial schema)
ALTER TABLE users ADD COLUMN IF NOT EXISTS posting_details JSONB DEFAULT '{}';

-- Documents extras (added after initial schema)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT false;

-- Grievances table
CREATE TABLE IF NOT EXISTS grievances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'rejected')),
  admin_remarks TEXT DEFAULT '',
  submitted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Error logs table
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT DEFAULT 'api',
  message TEXT NOT NULL,
  stack TEXT,
  path TEXT,
  method TEXT,
  status_code INTEGER,
  user_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  due_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  payment_proof_url TEXT,
  verified_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscription approval tracking
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Office address (home address uses existing 'address' column)
ALTER TABLE users ADD COLUMN IF NOT EXISTS office_address TEXT DEFAULT '';

-- Document visibility & per-member access
ALTER TABLE documents ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'all';

CREATE TABLE IF NOT EXISTS document_access (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_document_access_doc ON document_access(document_id);
CREATE INDEX IF NOT EXISTS idx_document_access_user ON document_access(user_id);

-- Additional indexes
CREATE INDEX IF NOT EXISTS idx_grievances_submitted_by ON grievances(submitted_by);
CREATE INDEX IF NOT EXISTS idx_grievances_status ON grievances(status);
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(type);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period ON subscriptions(period);

-- Auto-update updated_at on users
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team members junction table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_teams_sort_order ON teams(sort_order);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

-- To-Do List table (Eisenhower Matrix priority)
CREATE TABLE IF NOT EXISTS todos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'in_progress', 'completed', 'rejected')),
  urgent BOOLEAN DEFAULT FALSE,
  important BOOLEAN DEFAULT FALSE,
  due_date DATE,
  admin_remarks TEXT DEFAULT '',
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_todos_submitted_by ON todos(submitted_by);
CREATE INDEX IF NOT EXISTS idx_todos_assigned_to ON todos(assigned_to);
CREATE INDEX IF NOT EXISTS idx_todos_assigned_team ON todos(assigned_team_id);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);

-- Subtask hierarchy: parent_id allows task → subtask → sub-subtask (max 2 levels)
ALTER TABLE todos ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES todos(id) ON DELETE CASCADE;
-- Human-readable Event ID: ET-001 (task), ET-001-01 (subtask), ET-001-01-01 (sub-subtask)
ALTER TABLE todos ADD COLUMN IF NOT EXISTS event_id TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_todos_parent ON todos(parent_id);
CREATE INDEX IF NOT EXISTS idx_todos_event_id ON todos(event_id);

-- Todo notes/messages (reports, updates, deliverable descriptions)
CREATE TABLE IF NOT EXISTS todo_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  todo_id UUID REFERENCES todos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'note' CHECK (type IN ('note', 'report', 'update')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_todo_notes_todo ON todo_notes(todo_id);

-- Todo attachments (deliverable files uploaded against tasks)
CREATE TABLE IF NOT EXISTS todo_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  todo_id UUID REFERENCES todos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_todo_attachments_todo ON todo_attachments(todo_id);

-- Todo vouchers/bills (cost tracking with Finance Team approval)
CREATE TABLE IF NOT EXISTS todo_vouchers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  todo_id UUID REFERENCES todos(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  receipt_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  remarks TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_todo_vouchers_todo ON todo_vouchers(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_vouchers_status ON todo_vouchers(status);

-- Task commitment: member locks a task to themselves with estimates
ALTER TABLE todos ADD COLUMN IF NOT EXISTS committed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS estimated_time TEXT DEFAULT ''; -- e.g. "2 days", "4 hours"
ALTER TABLE todos ADD COLUMN IF NOT EXISTS estimated_amount NUMERIC DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_todos_committed_by ON todos(committed_by);

-- Telegram integration: store chat_id for bot notifications
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);
