/**
 * Module-level flags that track whether the Stage 4 schema migration
 * (`supabase/group_chat_stage4_schema.sql`) has been applied.
 *
 * Each flag starts as `true` (assume present). On the first PostgREST
 * "undefined column" error (42703), the handler flips the flag to `false`
 * via the `mark*Missing()` helpers and falls back to a feature-unavailable
 * response. The flag stays false until the process restarts, so we stop
 * wasting round trips on a column we know isn't there.
 *
 * Net effect: if the migration is forgotten before deploy, pin / edit
 * degrade gracefully instead of 500-ing the whole endpoint.
 */

let _editedAtAvailable = true;
let _pinnedMessageIdAvailable = true;

export function hasEditedAt(): boolean {
  return _editedAtAvailable;
}

export function hasPinnedMessageId(): boolean {
  return _pinnedMessageIdAvailable;
}

export function markEditedAtMissing(): void {
  _editedAtAvailable = false;
}

export function markPinnedMessageIdMissing(): void {
  _pinnedMessageIdAvailable = false;
}

/**
 * PostgreSQL error codes that PostgREST surfaces when a column or table
 * referenced in a query doesn't exist yet. Everything else should still
 * bubble up as a 500 — we only want to swallow schema-drift errors.
 */
export function isMissingSchema(
  err: { code?: string | null } | null | undefined
): boolean {
  return err?.code === "42703" || err?.code === "42P01";
}

/**
 * Test-only helper to reset flags between runs. Not exported from any
 * barrel; call-site import directly if needed.
 */
export function __resetChatSchemaFlags(): void {
  _editedAtAvailable = true;
  _pinnedMessageIdAvailable = true;
}
