import { getServiceClient } from "@/lib/supabase";

export type ContributionAction =
  | "payment_proof_uploaded"
  | "payment_verified"
  | "payment_rejected"
  | "payment_hold"
  | "member_approved"
  | "member_rejected"
  | "announcement_created"
  | "event_created"
  | "document_uploaded"
  | "suggestion_submitted"
  | "service_request_submitted"
  | "grievance_submitted"
  | "grievance_responded"
  | "task_created"
  | "task_committed"
  | "task_updated"
  | "task_note_added"
  | "task_report_added"
  | "voucher_submitted"
  | "voucher_approved"
  | "voucher_rejected"
  | "profile_updated"
  | "expense_voucher_submitted"
  | "expense_voucher_approved"
  | "expense_voucher_rejected"
  | "member_profile_edited"
  | "document_downloaded"
  | "used_ai_pest_id"
  | "used_ai_crop_advice"
  | "used_ai_translation"
  | "used_ai_ocr"
  | "used_ai_voice_notes"
  | "used_ai_doc_summarizer"
  | "used_ai_weather_advisory"
  | "used_ai_expense_ocr"
  | "used_ai_satellite_ndvi"
  | "training_created"
  | "training_enrolled"
  | "idea_submitted"
  | "idea_upvoted"
  | "voice_idea_transcribed"
  | "group_message_sent"
  | "chat_file_shared"
  | "logo_vote"
  | "logo_feedback"
  | "poll_voted"
  | "project_h_upload"
  | "diary_entry_submitted"
  | "diary_success_story_published";

const ACTION_CONFIG: Record<ContributionAction, { label: string; minutes: number }> = {
  payment_proof_uploaded:  { label: "Uploaded payment proof", minutes: 5 },
  payment_verified:        { label: "Verified payment", minutes: 3 },
  payment_rejected:        { label: "Rejected payment", minutes: 2 },
  payment_hold:            { label: "Put payment on hold", minutes: 2 },
  member_approved:         { label: "Approved member", minutes: 2 },
  member_rejected:         { label: "Rejected member", minutes: 2 },
  announcement_created:    { label: "Created announcement", minutes: 10 },
  event_created:           { label: "Created event", minutes: 10 },
  document_uploaded:       { label: "Uploaded document", minutes: 5 },
  suggestion_submitted:    { label: "Submitted suggestion", minutes: 5 },
  service_request_submitted: { label: "Submitted service request", minutes: 5 },
  grievance_submitted:     { label: "Submitted grievance", minutes: 5 },
  grievance_responded:     { label: "Responded to grievance", minutes: 5 },
  task_created:            { label: "Created task", minutes: 5 },
  task_committed:          { label: "Committed to task", minutes: 2 },
  task_updated:            { label: "Updated task", minutes: 3 },
  task_note_added:         { label: "Added task note", minutes: 5 },
  task_report_added:       { label: "Submitted task report", minutes: 5 },
  voucher_submitted:       { label: "Submitted task voucher", minutes: 5 },
  voucher_approved:        { label: "Approved voucher", minutes: 3 },
  voucher_rejected:        { label: "Rejected voucher", minutes: 3 },
  profile_updated:         { label: "Updated profile", minutes: 3 },
  expense_voucher_submitted: { label: "Submitted expense voucher", minutes: 5 },
  expense_voucher_approved:  { label: "Approved expense voucher", minutes: 3 },
  expense_voucher_rejected:  { label: "Rejected expense voucher", minutes: 3 },
  member_profile_edited:    { label: "Edited member profile", minutes: 3 },
  document_downloaded:      { label: "Downloaded document", minutes: 1 },
  used_ai_pest_id:          { label: "Used AI Pest Identifier", minutes: 2 },
  used_ai_crop_advice:      { label: "Used AI Crop Adviser", minutes: 2 },
  used_ai_translation:      { label: "Used AI Translation", minutes: 1 },
  used_ai_ocr:              { label: "Used AI OCR", minutes: 1 },
  used_ai_voice_notes:      { label: "Used AI Voice Notes", minutes: 1 },
  used_ai_doc_summarizer:   { label: "Used AI Document Summarizer", minutes: 2 },
  used_ai_weather_advisory: { label: "Used AI Weather Advisory", minutes: 2 },
  used_ai_expense_ocr:      { label: "Used AI Expense OCR", minutes: 2 },
  used_ai_satellite_ndvi:   { label: "Used AI Satellite Field Analysis", minutes: 3 },
  training_created:          { label: "Created training session", minutes: 10 },
  training_enrolled:         { label: "Enrolled in training", minutes: 2 },
  idea_submitted:            { label: "Submitted an idea", minutes: 3 },
  idea_upvoted:              { label: "Upvoted an idea", minutes: 1 },
  voice_idea_transcribed:    { label: "Recorded an idea by voice", minutes: 2 },
  group_message_sent:        { label: "Sent group chat message", minutes: 1 },
  chat_file_shared:          { label: "Shared file in group chat", minutes: 2 },
  logo_vote:                 { label: "Voted in logo selection", minutes: 1 },
  logo_feedback:             { label: "Shared logo feedback", minutes: 2 },
  poll_voted:                { label: "Voted in a poll", minutes: 1 },
  project_h_upload:          { label: "Uploaded Project H document", minutes: 5 },
  diary_entry_submitted:     { label: "Submitted field diary entry", minutes: 5 },
  diary_success_story_published: { label: "Field diary success story published", minutes: 10 },
};

export function getActionConfig(action: ContributionAction) {
  return ACTION_CONFIG[action];
}

/**
 * Log a contribution. Fire-and-forget — never throws.
 */
export function logContribution(
  userId: string,
  action: ContributionAction,
  description?: string,
  metadata?: Record<string, unknown>,
) {
  const config = ACTION_CONFIG[action];
  const supabase = getServiceClient();
  Promise.resolve(
    supabase
      .from("contributions")
      .insert({
        user_id: userId,
        action,
        description: description || config.label,
        estimated_minutes: config.minutes,
        metadata: metadata || {},
      })
  ).catch(() => {});
}
