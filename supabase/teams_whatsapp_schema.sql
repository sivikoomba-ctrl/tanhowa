-- Add an optional WhatsApp group invite link per team.
-- Shown as a "Join WhatsApp Group" button on the member teams page and a
-- WhatsApp icon on the admin team card. Idempotent.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS whatsapp_link TEXT;
