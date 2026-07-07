// Shared subscription helpers.

/**
 * A subscription has a "flexible" (pay-what-you-want) amount when it is explicitly
 * flagged via the `flexible_amount` column, OR — for backward compatibility — when
 * its label starts with "Volunteer" (the original voluntary-contribution convention).
 * When flexible, members may enter any amount on their payment and no mismatch
 * warning is shown.
 */
export function isFlexibleAmount(sub: {
  period?: string | null;
  flexible_amount?: boolean | null;
}): boolean {
  if (sub?.flexible_amount) return true;
  return (sub?.period || "").toLowerCase().startsWith("volunteer");
}

/**
 * Display label for a subscription period. "Special Amount" reads as "Special
 * Fund" everywhere it's shown to users — the stored `period` value is left
 * untouched since it's used for dedup/matching (e.g. `.ilike("period", ...)`).
 */
export function displayPeriod(period: string | null | undefined): string {
  if ((period || "").toLowerCase() === "special amount") return "Special Fund";
  return period || "";
}
