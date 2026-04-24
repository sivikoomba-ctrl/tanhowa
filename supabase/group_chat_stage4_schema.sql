-- Group Chat Stage 4 Schema: Message edit + Pinned messages + Search index
-- Apply via Supabase SQL Editor after group_chat_stage2_schema.sql

-- Edit support: track when a message was last edited.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Pinned message per channel (one at a time). ON DELETE SET NULL so a
-- pinned message being deleted just unpins the channel rather than
-- cascading the delete.
ALTER TABLE chat_channels
  ADD COLUMN IF NOT EXISTS pinned_message_id UUID
  REFERENCES chat_messages(id) ON DELETE SET NULL;

-- Trigram index on message content so ILIKE '%needle%' searches within a
-- channel stay cheap as the message table grows. pg_trgm is already
-- available on Supabase — CREATE EXTENSION is idempotent.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_chat_messages_content_trgm
  ON chat_messages USING gin (content gin_trgm_ops);
