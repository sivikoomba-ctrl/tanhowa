-- Email suppression for bounce/complaint handling (Part #1 of deliverability work).
-- Populated by the ZeptoMail webhook (/api/webhooks/zeptomail). Every send path
-- skips rows where email_status <> 'active'.
--   active     — deliverable (default)
--   bounced    — hard bounce; stop emailing
--   complained — marked as spam; stop emailing
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_bounced_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_bounce_reason text;

-- Fast lookup of suppressed addresses when filtering recipient lists.
CREATE INDEX IF NOT EXISTS idx_users_email_status ON users (email_status) WHERE email_status <> 'active';
