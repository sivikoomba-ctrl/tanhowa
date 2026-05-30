-- ================================================================
-- TNAHOA Portal Setup SQL
-- Tamil Nadu Assistant Horticulture Officers Association
-- Generated from TANHOWA schema. Apply in Supabase SQL Editor.
-- ================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS training_enrollments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  training_id uuid,
  user_id uuid,
  status text DEFAULT enrolled,
  enrolled_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS announcement_reads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  announcement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS todo_vouchers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  todo_id uuid,
  submitted_by uuid,
  title text NOT NULL,
  amount numeric NOT NULL,
  description text,
  receipt_url text,
  status text DEFAULT pending,
  approved_by uuid,
  approved_at text,
  remarks text,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS logo_comments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  concept_id uuid,
  comment text NOT NULL,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS document_access (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid,
  user_id uuid,
  created_at text DEFAULT now(),
  team_id uuid,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  endpoint text NOT NULL,
  keys text NOT NULL,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS expense_vouchers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  submitted_by uuid NOT NULL,
  title text NOT NULL,
  amount numeric NOT NULL,
  description text,
  receipt_url text,
  status text DEFAULT pending,
  approved_by uuid,
  approved_at text,
  remarks text,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  invoice_number text,
  vendor_name text,
  expense_date text,
  category text,
  payment_proof_url text,
  payment_method text,
  payment_transaction_id text,
  payment_date text,
  paid_to text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS wishlist_upvotes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  idea_id uuid,
  user_id uuid,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS chat_channels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  icon text DEFAULT MessageCircle,
  created_by uuid NOT NULL,
  is_default boolean,
  archived boolean,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS trainings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  description text,
  topic text,
  trainer_name text NOT NULL,
  trainer_email text,
  trainer_phone text,
  trainer_type text DEFAULT member,
  trainer_user_id uuid,
  date text,
  duration_hours numeric DEFAULT 1,
  location text,
  mode text DEFAULT offline,
  meeting_link text,
  max_participants int4,
  status text DEFAULT upcoming,
  materials_url text,
  created_by uuid,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  poll_id uuid NOT NULL,
  user_id uuid NOT NULL,
  option_index int4 NOT NULL,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS logo_concepts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  blurb text,
  image_url text NOT NULL,
  sort_order int4,
  active boolean DEFAULT true,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS todo_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  todo_id uuid,
  user_id uuid,
  content text NOT NULL,
  type text DEFAULT note,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS trainer_invites (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  training_id uuid,
  user_id uuid,
  external_name text,
  external_email text,
  external_phone text,
  invited_by uuid,
  status text DEFAULT pending,
  message text,
  responded_at text,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  period text NOT NULL,
  amount numeric,
  status text DEFAULT pending,
  due_date text,
  paid_at text,
  payment_method text,
  transaction_id text,
  remarks text,
  payment_proof_url text,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  approved_by uuid,
  approved_at text,
  payment_group_id uuid,
  razorpay_order_id text,
  razorpay_payment_id text,
  paid_amount numeric,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  channel_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  content text,
  file_url text,
  file_name text,
  file_type text,
  file_size int4,
  reply_to uuid,
  deleted_at text,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS api_perf (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  path text NOT NULL,
  method text NOT NULL,
  status_code int4,
  duration_ms int4 NOT NULL,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS todo_time_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  todo_id uuid NOT NULL,
  user_id uuid NOT NULL,
  hours numeric NOT NULL,
  description text,
  logged_at text DEFAULT now(),
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS admin_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  description text,
  category text DEFAULT General,
  file_url text NOT NULL,
  file_name text,
  file_type text,
  file_size int4,
  created_by uuid NOT NULL,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS resolution_votes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  resolution_id uuid,
  user_id uuid,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS grievances (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  category text,
  status text DEFAULT pending,
  admin_remarks text,
  submitted_by uuid,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  priority text DEFAULT medium,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS polls (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  options text NOT NULL,
  created_by uuid,
  status text DEFAULT active,
  expires_at text,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS content_translations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  field text NOT NULL,
  lang text DEFAULT ta NOT NULL,
  translated_text text NOT NULL,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  code text NOT NULL,
  expires_at text NOT NULL,
  used boolean,
  created_at text DEFAULT now(),
  purpose text DEFAULT login NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS chat_message_mentions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_id uuid NOT NULL,
  mentioned_user_id uuid NOT NULL,
  read_at text,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS achievements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  badge text NOT NULL,
  earned_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS history_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_date text NOT NULL,
  title text NOT NULL,
  description text,
  image_url text,
  sort_order int4,
  created_by uuid,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS feedback_prompts_shown (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  shown_at text DEFAULT now(),
  responded boolean,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS todo_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  todo_id uuid,
  user_id uuid,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  event_type text NOT NULL,
  page_path text NOT NULL,
  element_id text,
  element_text text,
  device_type text,
  screen_width int4,
  screen_height int4,
  user_agent text,
  referrer text,
  session_id text,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS teams (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  icon text,
  sort_order int4,
  created_by uuid,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  is_private boolean NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS logo_votes (
  user_id uuid NOT NULL,
  concept_id uuid NOT NULL,
  voted_at text DEFAULT now(),
  PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS feedback (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  source text NOT NULL,
  rating int4,
  reason text,
  comment text,
  page_url text,
  metadata text,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS contributions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL,
  description text NOT NULL,
  estimated_minutes int4 NOT NULL,
  metadata text,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS event_rsvps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text DEFAULT going NOT NULL,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  author_id uuid,
  published boolean,
  created_at text DEFAULT now(),
  scheduled_at text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS admin_tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  description text,
  type text DEFAULT internal NOT NULL,
  status text DEFAULT pending NOT NULL,
  priority text DEFAULT medium,
  assigned_to uuid,
  assigned_team_id uuid,
  due_date text,
  completed_at text,
  remarks text,
  created_by uuid NOT NULL,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  content text NOT NULL,
  read_at text,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS pest_identifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  member_district text,
  created_at text DEFAULT now() NOT NULL,
  image_path text NOT NULL,
  image_size bigint,
  mime_type text,
  gemini_model_version text DEFAULT gemini-2.5-flash,
  predicted_pest_name text,
  predicted_tamil_name text,
  predicted_crop text,
  predicted_severity text,
  predicted_confidence text,
  predicted_treatment text,
  predicted_prevention text,
  predicted_additional_notes text,
  user_feedback text,
  user_feedback_note text,
  verified_pest_name text,
  verified_tamil_name text,
  verified_crop text,
  verified_severity text,
  verified_notes text,
  verified_by uuid,
  verified_at text,
  review_status text DEFAULT pending NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS site_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  value text,
  updated_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS todos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  description text,
  submitted_by uuid,
  assigned_to uuid,
  status text DEFAULT pending,
  urgent boolean,
  important boolean,
  due_date text,
  admin_remarks text,
  approved_by uuid,
  approved_at text,
  completed_at text,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  assigned_team_id uuid,
  parent_id uuid,
  event_id text,
  committed_by uuid,
  committed_at text,
  estimated_time text,
  estimated_amount numeric,
  timebox_hours numeric,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  description text,
  date text NOT NULL,
  location text,
  image_url text,
  created_by uuid,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  uploaded_by uuid,
  created_at text DEFAULT now(),
  description text,
  category text,
  approved boolean,
  visibility text DEFAULT all,
  summary text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS volunteer_invites (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  district text NOT NULL,
  status text DEFAULT pending NOT NULL,
  created_at text DEFAULT now() NOT NULL,
  responded_at text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS document_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL,
  version_num int4 DEFAULT 1 NOT NULL,
  file_url text NOT NULL,
  title text,
  description text,
  change_summary text,
  changed_by uuid,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS training_materials (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  training_id uuid,
  title text NOT NULL,
  description text,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size int4,
  language text DEFAULT en,
  group_id uuid,
  access text DEFAULT enrolled,
  sort_order int4,
  uploaded_by uuid,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS training_material_access (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  material_id uuid,
  user_id uuid,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  name text,
  phone text,
  photo_url text,
  address text,
  dob text,
  occupation text,
  social_links text,
  role text DEFAULT member NOT NULL,
  status text DEFAULT pending NOT NULL,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  posting_details text,
  office_address text,
  profile_nudge text,
  last_active_at text,
  telegram_chat_id text,
  phone_verified boolean,
  official_type text,
  last_lat float8,
  last_lng float8,
  location_updated_at text,
  location_sharing boolean,
  notification_prefs text,
  login_count int4,
  suspension_details text,
  telegram_last_cmd_msg_id bigint,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS project_h_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  description text,
  category text DEFAULT Other NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  mime_type text,
  uploaded_by uuid NOT NULL,
  created_at text DEFAULT now() NOT NULL,
  updated_at text DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS resolutions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text,
  status text DEFAULT draft,
  submitted_by uuid,
  approved_by uuid,
  approved_at text,
  voting_opened_at text,
  voting_closed_at text,
  votes_required int4 DEFAULT 400,
  total_members int4 DEFAULT 798,
  admin_remarks text,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS chat_message_reactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS error_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  type text DEFAULT client,
  message text NOT NULL,
  stack text,
  path text,
  method text,
  status_code int4,
  user_id uuid,
  metadata text,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS chat_channel_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  channel_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT member,
  last_read_at text DEFAULT now(),
  muted boolean,
  joined_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS wishlist_ideas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text,
  status text DEFAULT open,
  upvote_count int4,
  submitted_by uuid,
  approved_by uuid,
  admin_remarks text,
  linked_task_id uuid,
  created_at text DEFAULT now(),
  updated_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS team_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  team_id uuid,
  user_id uuid,
  role text DEFAULT member,
  added_by uuid,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  details text,
  created_at text DEFAULT now(),
  PRIMARY KEY (id)
);

-- Foreign Key Constraints
ALTER TABLE training_enrollments ADD CONSTRAINT fk_training_enrollments_training_id FOREIGN KEY (training_id) REFERENCES trainings(id) ON DELETE CASCADE;
ALTER TABLE training_enrollments ADD CONSTRAINT fk_training_enrollments_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE announcement_reads ADD CONSTRAINT fk_announcement_reads_announcement_id FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE;
ALTER TABLE announcement_reads ADD CONSTRAINT fk_announcement_reads_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE todo_vouchers ADD CONSTRAINT fk_todo_vouchers_todo_id FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE;
ALTER TABLE todo_vouchers ADD CONSTRAINT fk_todo_vouchers_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE todo_vouchers ADD CONSTRAINT fk_todo_vouchers_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE logo_comments ADD CONSTRAINT fk_logo_comments_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE logo_comments ADD CONSTRAINT fk_logo_comments_concept_id FOREIGN KEY (concept_id) REFERENCES logo_concepts(id) ON DELETE CASCADE;
ALTER TABLE document_access ADD CONSTRAINT fk_document_access_document_id FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE document_access ADD CONSTRAINT fk_document_access_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE document_access ADD CONSTRAINT fk_document_access_team_id FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE push_subscriptions ADD CONSTRAINT fk_push_subscriptions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE expense_vouchers ADD CONSTRAINT fk_expense_vouchers_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE expense_vouchers ADD CONSTRAINT fk_expense_vouchers_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE wishlist_upvotes ADD CONSTRAINT fk_wishlist_upvotes_idea_id FOREIGN KEY (idea_id) REFERENCES wishlist_ideas(id) ON DELETE CASCADE;
ALTER TABLE wishlist_upvotes ADD CONSTRAINT fk_wishlist_upvotes_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE chat_channels ADD CONSTRAINT fk_chat_channels_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE trainings ADD CONSTRAINT fk_trainings_trainer_user_id FOREIGN KEY (trainer_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE trainings ADD CONSTRAINT fk_trainings_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE poll_votes ADD CONSTRAINT fk_poll_votes_poll_id FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE;
ALTER TABLE poll_votes ADD CONSTRAINT fk_poll_votes_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE todo_notes ADD CONSTRAINT fk_todo_notes_todo_id FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE;
ALTER TABLE todo_notes ADD CONSTRAINT fk_todo_notes_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE trainer_invites ADD CONSTRAINT fk_trainer_invites_training_id FOREIGN KEY (training_id) REFERENCES trainings(id) ON DELETE CASCADE;
ALTER TABLE trainer_invites ADD CONSTRAINT fk_trainer_invites_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE trainer_invites ADD CONSTRAINT fk_trainer_invites_invited_by FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE subscriptions ADD CONSTRAINT fk_subscriptions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE subscriptions ADD CONSTRAINT fk_subscriptions_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_messages_channel_id FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE;
ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_messages_sender_id FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_messages_reply_to FOREIGN KEY (reply_to) REFERENCES chat_messages(id) ON DELETE CASCADE;
ALTER TABLE todo_time_entries ADD CONSTRAINT fk_todo_time_entries_todo_id FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE;
ALTER TABLE todo_time_entries ADD CONSTRAINT fk_todo_time_entries_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE admin_documents ADD CONSTRAINT fk_admin_documents_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE resolution_votes ADD CONSTRAINT fk_resolution_votes_resolution_id FOREIGN KEY (resolution_id) REFERENCES resolutions(id) ON DELETE CASCADE;
ALTER TABLE resolution_votes ADD CONSTRAINT fk_resolution_votes_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE grievances ADD CONSTRAINT fk_grievances_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE polls ADD CONSTRAINT fk_polls_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE chat_message_mentions ADD CONSTRAINT fk_chat_message_mentions_message_id FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
ALTER TABLE chat_message_mentions ADD CONSTRAINT fk_chat_message_mentions_mentioned_user_id FOREIGN KEY (mentioned_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE achievements ADD CONSTRAINT fk_achievements_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE history_entries ADD CONSTRAINT fk_history_entries_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE feedback_prompts_shown ADD CONSTRAINT fk_feedback_prompts_shown_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE todo_attachments ADD CONSTRAINT fk_todo_attachments_todo_id FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE;
ALTER TABLE todo_attachments ADD CONSTRAINT fk_todo_attachments_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE analytics_events ADD CONSTRAINT fk_analytics_events_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE teams ADD CONSTRAINT fk_teams_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE logo_votes ADD CONSTRAINT fk_logo_votes_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE logo_votes ADD CONSTRAINT fk_logo_votes_concept_id FOREIGN KEY (concept_id) REFERENCES logo_concepts(id) ON DELETE CASCADE;
ALTER TABLE feedback ADD CONSTRAINT fk_feedback_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE contributions ADD CONSTRAINT fk_contributions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE event_rsvps ADD CONSTRAINT fk_event_rsvps_event_id FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
ALTER TABLE event_rsvps ADD CONSTRAINT fk_event_rsvps_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE announcements ADD CONSTRAINT fk_announcements_author_id FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE admin_tasks ADD CONSTRAINT fk_admin_tasks_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE admin_tasks ADD CONSTRAINT fk_admin_tasks_assigned_team_id FOREIGN KEY (assigned_team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE admin_tasks ADD CONSTRAINT fk_admin_tasks_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE messages ADD CONSTRAINT fk_messages_sender_id FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE messages ADD CONSTRAINT fk_messages_recipient_id FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE pest_identifications ADD CONSTRAINT fk_pest_identifications_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE pest_identifications ADD CONSTRAINT fk_pest_identifications_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE todos ADD CONSTRAINT fk_todos_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE todos ADD CONSTRAINT fk_todos_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE todos ADD CONSTRAINT fk_todos_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE todos ADD CONSTRAINT fk_todos_assigned_team_id FOREIGN KEY (assigned_team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE todos ADD CONSTRAINT fk_todos_parent_id FOREIGN KEY (parent_id) REFERENCES todos(id) ON DELETE CASCADE;
ALTER TABLE todos ADD CONSTRAINT fk_todos_committed_by FOREIGN KEY (committed_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE events ADD CONSTRAINT fk_events_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE documents ADD CONSTRAINT fk_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE volunteer_invites ADD CONSTRAINT fk_volunteer_invites_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE volunteer_invites ADD CONSTRAINT fk_volunteer_invites_invited_by FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE document_versions ADD CONSTRAINT fk_document_versions_document_id FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE document_versions ADD CONSTRAINT fk_document_versions_changed_by FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE training_materials ADD CONSTRAINT fk_training_materials_training_id FOREIGN KEY (training_id) REFERENCES trainings(id) ON DELETE CASCADE;
ALTER TABLE training_materials ADD CONSTRAINT fk_training_materials_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE training_material_access ADD CONSTRAINT fk_training_material_access_material_id FOREIGN KEY (material_id) REFERENCES training_materials(id) ON DELETE CASCADE;
ALTER TABLE training_material_access ADD CONSTRAINT fk_training_material_access_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE project_h_documents ADD CONSTRAINT fk_project_h_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE resolutions ADD CONSTRAINT fk_resolutions_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE resolutions ADD CONSTRAINT fk_resolutions_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE chat_message_reactions ADD CONSTRAINT fk_chat_message_reactions_message_id FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
ALTER TABLE chat_message_reactions ADD CONSTRAINT fk_chat_message_reactions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE chat_channel_members ADD CONSTRAINT fk_chat_channel_members_channel_id FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE;
ALTER TABLE chat_channel_members ADD CONSTRAINT fk_chat_channel_members_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE wishlist_ideas ADD CONSTRAINT fk_wishlist_ideas_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE wishlist_ideas ADD CONSTRAINT fk_wishlist_ideas_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE wishlist_ideas ADD CONSTRAINT fk_wishlist_ideas_linked_task_id FOREIGN KEY (linked_task_id) REFERENCES todos(id) ON DELETE CASCADE;
ALTER TABLE team_members ADD CONSTRAINT fk_team_members_team_id FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE team_members ADD CONSTRAINT fk_team_members_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE team_members ADD CONSTRAINT fk_team_members_added_by FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Row Level Security (enable; add policies per your needs)
ALTER TABLE training_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE logo_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_upvotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE logo_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_perf ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolution_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievances ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE history_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_prompts_shown ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE logo_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pest_identifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_material_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_h_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Storage Buckets (create in Supabase Dashboard → Storage)
-- Required: avatars (public), payment-proofs (private), documents (private), history-images (public)

-- ================================================================
-- TNAHOA Seed Data (site_settings)
-- ================================================================
INSERT INTO site_settings (key, value) VALUES ('community_name', 'TNAHOA') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('full_name', 'Tamil Nadu Assistant Horticulture Officers Association') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('tagline', 'Horticulture Community') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('about', 'Connecting Assistant Horticulture Officers in Tamil Nadu Department of Horticulture and Plantation Crops') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('founded_year', '') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('contact_email', '') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('website', '') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('annual_subscription', '3000') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('uatt_contribution', '3000') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('total_target_members', '') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('payment_upi_id', '') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('photo_guidelines', 'Please upload a clear passport-size photo of yourself. No group photos, landscapes, or blurry images.') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('whatsapp_link', '') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('youtube_link', '') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('telegram_link', '') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO site_settings (key, value) VALUES ('x_link', '') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;