-- Folders for the Special Document Vault (owner-only)
CREATE TABLE IF NOT EXISTS admin_document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (created_by, name)
);

ALTER TABLE admin_document_folders ENABLE ROW LEVEL SECURITY;

-- Docs in a deleted folder fall back to Unfiled (NULL), never deleted
ALTER TABLE admin_documents
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES admin_document_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_documents_folder ON admin_documents(folder_id);

-- One-time migration: a folder per existing distinct category, then file the docs
INSERT INTO admin_document_folders (name, created_by)
SELECT DISTINCT category, created_by FROM admin_documents WHERE category IS NOT NULL
ON CONFLICT (created_by, name) DO NOTHING;

UPDATE admin_documents d
SET folder_id = f.id
FROM admin_document_folders f
WHERE d.folder_id IS NULL AND f.created_by = d.created_by AND f.name = d.category;
