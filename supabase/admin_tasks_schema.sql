-- Admin Special Tasks: private task list for super_admin only
CREATE TABLE IF NOT EXISTS admin_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'internal' CHECK (type IN ('internal', 'assigned', 'checklist')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to UUID REFERENCES users(id),
  assigned_team_id UUID REFERENCES teams(id),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  remarks TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (no permissive policies — service role only)
ALTER TABLE admin_tasks ENABLE ROW LEVEL SECURITY;

-- Index for quick lookups
CREATE INDEX idx_admin_tasks_type ON admin_tasks(type);
CREATE INDEX idx_admin_tasks_status ON admin_tasks(status);
CREATE INDEX idx_admin_tasks_created_by ON admin_tasks(created_by);
