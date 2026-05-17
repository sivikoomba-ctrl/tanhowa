-- Pest & Disease Identification training dataset.
-- Captures the raw Gemini prediction, member feedback, and expert ground-truth
-- so the collection can be exported as a labeled dataset for fine-tuning.

CREATE TABLE IF NOT EXISTS pest_identifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_district TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  image_path TEXT NOT NULL,
  image_size BIGINT DEFAULT 0,
  mime_type TEXT DEFAULT '',

  -- Raw Gemini prediction (frozen at the moment of capture)
  gemini_model_version TEXT DEFAULT 'gemini-2.5-flash',
  predicted_pest_name TEXT DEFAULT '',
  predicted_tamil_name TEXT DEFAULT '',
  predicted_crop TEXT DEFAULT '',
  predicted_severity TEXT DEFAULT '',
  predicted_confidence TEXT DEFAULT '',
  predicted_treatment TEXT DEFAULT '',
  predicted_prevention TEXT DEFAULT '',
  predicted_additional_notes TEXT DEFAULT '',

  -- Member feedback (cheap signal)
  user_feedback TEXT,                       -- 'helpful' | 'incorrect' | 'unsure' | NULL
  user_feedback_note TEXT DEFAULT '',

  -- Expert ground truth (only filled by curator)
  verified_pest_name TEXT DEFAULT '',
  verified_tamil_name TEXT DEFAULT '',
  verified_crop TEXT DEFAULT '',
  verified_severity TEXT DEFAULT '',
  verified_notes TEXT DEFAULT '',
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,

  -- 'pending' | 'confirmed' | 'corrected' | 'rejected' | 'unusable'
  review_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_pest_identifications_user_created
  ON pest_identifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pest_identifications_status_created
  ON pest_identifications(review_status, created_at ASC);

ALTER TABLE pest_identifications ENABLE ROW LEVEL SECURITY;
-- No permissive policies — service-role-only access (matches portal-wide pattern).
