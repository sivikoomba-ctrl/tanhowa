-- Training sessions table
CREATE TABLE trainings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  topic TEXT DEFAULT '',
  trainer_name TEXT NOT NULL,
  trainer_email TEXT DEFAULT '',
  trainer_phone TEXT DEFAULT '',
  trainer_type TEXT DEFAULT 'member' CHECK (trainer_type IN ('member', 'external')),
  trainer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  date TIMESTAMPTZ,
  duration_hours NUMERIC(5,2) DEFAULT 1,
  location TEXT DEFAULT '',
  mode TEXT DEFAULT 'offline' CHECK (mode IN ('online', 'offline', 'hybrid')),
  meeting_link TEXT DEFAULT '',
  max_participants INT DEFAULT 0,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
  materials_url TEXT DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training enrollments table
CREATE TABLE training_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID REFERENCES trainings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'attended', 'absent', 'cancelled')),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(training_id, user_id)
);
