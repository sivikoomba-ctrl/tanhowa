CREATE TABLE analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  page_path TEXT NOT NULL,
  element_id TEXT,
  element_text TEXT,
  device_type TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  user_agent TEXT,
  referrer TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_analytics_created_at ON analytics_events(created_at DESC);
CREATE INDEX idx_analytics_page_path ON analytics_events(page_path);
CREATE INDEX idx_analytics_event_type ON analytics_events(event_type);
