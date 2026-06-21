-- Document folders for the member-facing Document Vault, with folder-level access.
-- "Folder governs": a member who can access a folder sees every approved document in it.
-- Documents with folder_id = NULL keep their existing per-document visibility (document_access).

CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  visibility TEXT DEFAULT 'all' CHECK (visibility IN ('all', 'specific', 'team')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name)
);

-- Who can access a folder when visibility = 'specific' (user rows) or 'team' (team rows).
CREATE TABLE IF NOT EXISTS folder_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES document_folders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_folder_access_folder ON folder_access(folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_access_user ON folder_access(user_id);
CREATE INDEX IF NOT EXISTS idx_folder_access_team ON folder_access(team_id);

-- Documents can belong to a folder (NULL = unfiled, keeps per-document visibility).
ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
