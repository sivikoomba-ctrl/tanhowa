-- Special Document Vault: private documents for system admin only
CREATE TABLE IF NOT EXISTS admin_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'General',
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (no permissive policies — service role only)
ALTER TABLE admin_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_admin_documents_created_by ON admin_documents(created_by);
CREATE INDEX idx_admin_documents_category ON admin_documents(category);
