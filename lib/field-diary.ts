// Shared helpers for the Field Diary feature (daily field-work log).

/** Today's calendar date in IST as YYYY-MM-DD. Never trust a client-supplied date for entry_date. */
export function todayIST(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Yesterday's calendar date in IST as YYYY-MM-DD — used by the nightly compliance sweep. */
export function yesterdayIST(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(Date.now() + IST_OFFSET_MS - 24 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** How many past days a member may backfill a missed entry for (not including today, which uses the normal flow). */
export const BACKFILL_WINDOW_DAYS = 7;

/**
 * True if `dateStr` (YYYY-MM-DD) is a valid backfill target: strictly before
 * today (IST) and no more than BACKFILL_WINDOW_DAYS days in the past.
 * Plain string comparison is safe since YYYY-MM-DD sorts lexicographically.
 */
export function isValidBackfillDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const today = todayIST();
  if (dateStr >= today) return false;
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const earliest = new Date(Date.now() + IST_OFFSET_MS - BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return dateStr >= earliest;
}

/**
 * True if `dateStr` is a valid target for correcting an existing entry's
 * date: today or within the backfill window — not in the future, and not
 * older than BACKFILL_WINDOW_DAYS. Unlike isValidBackfillDate (used only for
 * creating a new backdated entry), today is allowed here since an edit may
 * move a misdated entry back onto today.
 */
export function isValidEntryEditDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const today = todayIST();
  if (dateStr > today) return false;
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const earliest = new Date(Date.now() + IST_OFFSET_MS - BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return dateStr >= earliest;
}
