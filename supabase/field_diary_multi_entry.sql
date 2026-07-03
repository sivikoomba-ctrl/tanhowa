-- Allow multiple Field Diary entries per member per day (e.g. a morning visit
-- and an afternoon visit logged separately). entry_date stays on the row for
-- date-scoping/compliance ("at least one entry that day" still applies), but
-- it's no longer unique per member — every POST now inserts a new row instead
-- of upserting the day's single row.
ALTER TABLE field_diary_entries DROP CONSTRAINT IF EXISTS field_diary_entries_member_id_entry_date_key;
