-- Track the message_id of the bot's most recent command response per linked user.
-- Used by sendTelegramMessageReplace() in lib/telegram.ts to delete the previous
-- bot reply before sending a new one, keeping the chat tidy when members iterate
-- through /mytasks, /help, /status, /done, /commit, etc.
-- Notification messages (task assigned, payment rejected) do NOT update this column,
-- so informational pings remain in the history.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_last_cmd_msg_id BIGINT;
