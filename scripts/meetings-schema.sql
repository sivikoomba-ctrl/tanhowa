-- Stage 3: Governance / AGM suite — meetings, agenda, attendance.
-- Managed by super-admins and state officials (lib/governance-auth.ts).
CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL DEFAULT 'committee',          -- agm | committee | ec | general | special
  description text DEFAULT '',
  scheduled_at timestamptz,
  location text DEFAULT '',
  mode text NOT NULL DEFAULT 'in_person',           -- in_person | online | hybrid
  meeting_link text DEFAULT '',
  status text NOT NULL DEFAULT 'scheduled',          -- draft | scheduled | in_progress | completed | cancelled
  quorum_required int,
  minutes text DEFAULT '',
  minutes_finalized boolean NOT NULL DEFAULT false,
  minutes_finalized_at timestamptz,
  minutes_finalized_by uuid REFERENCES users(id),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_agenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  order_index int NOT NULL DEFAULT 0,
  presenter uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending',            -- pending | discussed | deferred | resolved
  linked_resolution_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meeting_agenda_meeting ON meeting_agenda(meeting_id);

CREATE TABLE IF NOT EXISTS meeting_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rsvp text,                                         -- yes | no | maybe
  attended boolean NOT NULL DEFAULT false,
  role_at_meeting text,                              -- chair | secretary | member | guest
  marked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_meeting ON meeting_attendance(meeting_id);

-- RLS enabled, no policies (service role bypasses; anon has zero access).
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendance ENABLE ROW LEVEL SECURITY;
