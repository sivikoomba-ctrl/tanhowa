-- Track when a member last uploaded their profile photo.
-- Stamped by POST /api/upload/avatar; lets the photo-review page count
-- "uploaded today" accurately (review actions no longer mask uploads).
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_uploaded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_photo_uploaded_at
  ON users (photo_uploaded_at DESC)
  WHERE photo_uploaded_at IS NOT NULL;
