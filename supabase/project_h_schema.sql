-- Project H — restricted policy document vault for TT Team members.
-- Access gated via membership in the team named "TT Team" (plus super_admin).

CREATE TABLE IF NOT EXISTS project_h_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Other',
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  mime_type TEXT DEFAULT '',
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_h_documents_category ON project_h_documents(category);
CREATE INDEX IF NOT EXISTS idx_project_h_documents_uploaded_by ON project_h_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_project_h_documents_created_at ON project_h_documents(created_at DESC);

ALTER TABLE project_h_documents ENABLE ROW LEVEL SECURITY;
-- No permissive policies — service-role-only access (matches portal-wide pattern).
