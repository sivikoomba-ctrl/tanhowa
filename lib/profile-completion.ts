/**
 * Single source of truth for the mandatory-profile-completion gate. Used by the dashboard
 * layout (blocks navigation until clear), the admin overview metric ("Profile Updated" card),
 * and the admin Member Approval "Profile Status" filter/export — keep all three on this.
 */

const PLACEHOLDER_NAMES = new Set(["unnamed", "user", "test", "guest", "anonymous", "no name", "n/a", "na"]);

export interface ProfileCompletionFields {
  name?: string | null;
  phone?: string | null;
  occupation?: string | null;
  posting_details?: { regular_district?: string; regular_block?: string } | null;
  dob?: string | null;
  social_links?: { gender?: string } | null;
  address?: string | null;
  office_address?: string | null;
}

export function getMissingProfileFields(u: ProfileCompletionFields): string[] {
  const missing: string[] = [];
  const trimmedName = (u.name || "").trim();
  const nameParts = trimmedName.split(/\s+/).filter(Boolean);
  // Flag missing if no name, fewer than 2 parts, or any placeholder word like "unnamed" / "user"
  const isPlaceholder = trimmedName.length > 0 && nameParts.every((p) => PLACEHOLDER_NAMES.has(p.toLowerCase()));
  if (!trimmedName || nameParts.length < 2 || isPlaceholder) missing.push("Full Name (First + Last)");
  if (!u.phone?.trim()) missing.push("Phone Number");
  if (!u.occupation?.trim()) missing.push("Designation");
  if (!u.posting_details?.regular_district) missing.push("District");
  if (!u.posting_details?.regular_block) missing.push("Posting location");
  if (!u.dob) missing.push("Date of Birth");
  if (!u.social_links?.gender) missing.push("Gender");
  if (!u.address?.trim() && !u.office_address?.trim()) missing.push("Address");
  return missing;
}

export function isProfileComplete(u: ProfileCompletionFields): boolean {
  return getMissingProfileFields(u).length === 0;
}
