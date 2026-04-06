CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_num INT NOT NULL DEFAULT 1,
  file_url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  change_summary TEXT,
  changed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_doc_versions_doc ON document_versions(document_id, version_num DESC);
