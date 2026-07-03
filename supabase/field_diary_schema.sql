-- Daily Field Diary: mandatory daily field-work log, self-published (no approval gate).
-- See tanhowa/CLAUDE.md "Field Diary" section (once added) for the feature writeup.

CREATE TABLE IF NOT EXISTS field_diary_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,                 -- server-computed IST date, never client-supplied
  report_text TEXT NOT NULL,
  is_success_story BOOLEAN NOT NULL DEFAULT false,
  district TEXT,                            -- snapshot via trigger, grievances pattern
  block TEXT,
  story_status TEXT NOT NULL DEFAULT 'none' CHECK (story_status IN ('none','queued','drafted','dismissed','published')),
  story_draft_title TEXT,
  story_draft_body TEXT,
  story_generated_at TIMESTAMPTZ,
  story_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  story_reviewed_at TIMESTAMPTZ,
  story_remarks TEXT,
  published_announcement_id UUID REFERENCES announcements(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_field_diary_member ON field_diary_entries(member_id);
CREATE INDEX IF NOT EXISTS idx_field_diary_date ON field_diary_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_field_diary_district ON field_diary_entries(district);
CREATE INDEX IF NOT EXISTS idx_field_diary_story_status ON field_diary_entries(story_status) WHERE story_status IN ('queued', 'drafted');

ALTER TABLE field_diary_entries ENABLE ROW LEVEL SECURITY;

-- District/block snapshot at insert time, same pattern as assign_grievance_district()
-- in supabase/grievance_district_fixes.sql — later profile edits don't retroactively
-- move historical diary rows.
CREATE OR REPLACE FUNCTION assign_field_diary_district()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.district IS NULL THEN
    NEW.district := (SELECT posting_details->>'regular_district' FROM users WHERE id = NEW.member_id);
  END IF;
  IF NEW.block IS NULL THEN
    NEW.block := (SELECT posting_details->>'regular_block' FROM users WHERE id = NEW.member_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_field_diary_district ON field_diary_entries;
CREATE TRIGGER trg_assign_field_diary_district
  BEFORE INSERT ON field_diary_entries
  FOR EACH ROW EXECUTE FUNCTION assign_field_diary_district();

CREATE OR REPLACE FUNCTION touch_field_diary_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_field_diary ON field_diary_entries;
CREATE TRIGGER trg_touch_field_diary
  BEFORE UPDATE ON field_diary_entries
  FOR EACH ROW EXECUTE FUNCTION touch_field_diary_updated_at();

-- Media junction table (photos / videos / audio), one row per file.
CREATE TABLE IF NOT EXISTS field_diary_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES field_diary_entries(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video', 'audio')),
  file_path TEXT NOT NULL,     -- storage object key (private bucket), NOT a URL
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_diary_media_entry ON field_diary_media(entry_id);
ALTER TABLE field_diary_media ENABLE ROW LEVEL SECURITY;
