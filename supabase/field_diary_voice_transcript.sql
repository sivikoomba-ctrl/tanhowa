-- Stores the AI transcript of an uploaded voice note (Tamil/English translated
-- to English) directly on the media row, so it can be shown alongside the
-- audio clip and included in the PDF/Word diary export.
ALTER TABLE field_diary_media ADD COLUMN IF NOT EXISTS transcript TEXT;
