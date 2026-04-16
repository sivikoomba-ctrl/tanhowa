-- Group Chat Stage 2 Schema: Mentions + Reactions
-- Apply via Supabase SQL Editor after group_chat_schema.sql

-- @mentions in chat messages
CREATE TABLE IF NOT EXISTS chat_message_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_mentions_user_unread
  ON chat_message_mentions(mentioned_user_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_mentions_message
  ON chat_message_mentions(message_id);

-- Emoji reactions on chat messages
CREATE TABLE IF NOT EXISTS chat_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (char_length(emoji) <= 16),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message
  ON chat_message_reactions(message_id);

-- Enable RLS (service role bypasses; anon locked out — matches project pattern)
ALTER TABLE chat_message_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message_reactions ENABLE ROW LEVEL SECURITY;
