-- Track when a member's phone number was last changed (self-service or admin edit).
-- Stamped by PUT /api/users/me and PUT /api/admin/users (action=edit-profile).
-- Full old-vs-new history lives in audit_logs (action=phone_number_changed);
-- this column is just a fast "last changed" glance on the admin member card.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_changed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_phone_changed_at
  ON users (phone_changed_at DESC)
  WHERE phone_changed_at IS NOT NULL;
