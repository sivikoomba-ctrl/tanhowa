CREATE TABLE api_perf (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_api_perf_created_at ON api_perf(created_at DESC);
CREATE INDEX idx_api_perf_path ON api_perf(path);
