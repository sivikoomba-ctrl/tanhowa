-- Restore the error-logs resolve workflow.
-- lib/error-logger.ts (logError) and app/api/error-logs + /admin/error-logs all
-- expect `status` and `resolved_at` columns, but they were never created on the
-- base error_logs table. Every insert therefore failed with PGRST204
-- ("Could not find the 'status' column"), the catch swallowed it, and NOTHING
-- was ever logged (table sat at 0 rows despite real 500s). Adding the columns
-- fixes both logging and the resolve UI.

ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unresolved';
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_error_logs_status ON error_logs(status);
