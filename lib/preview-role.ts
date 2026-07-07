"use client";

// Lets a super-admin preview the admin panel's sidebar as it would appear to
// another role, without changing any real permissions or data access — this
// only swaps the {role, official_type} pair that nav-visibility checks read.
// Purely client-side (sessionStorage), never sent to the server.

export type PreviewRole = "member" | "district" | "state" | "super_admin";

export const PREVIEW_ROLES: { value: PreviewRole; label: string }[] = [
  { value: "super_admin", label: "Super-admin (real)" },
  { value: "state", label: "State Official" },
  { value: "district", label: "District Official" },
  { value: "member", label: "Member" },
];

const KEY = "tanhowa-preview-role";

export function getPreviewRole(): PreviewRole | null {
  if (typeof window === "undefined") return null;
  const v = sessionStorage.getItem(KEY);
  return PREVIEW_ROLES.some((r) => r.value === v) ? (v as PreviewRole) : null;
}

export function setPreviewRole(role: PreviewRole | null) {
  if (typeof window === "undefined") return;
  if (role && role !== "super_admin") sessionStorage.setItem(KEY, role);
  else sessionStorage.removeItem(KEY);
}

/**
 * Maps a preview role to the {role, official_type, email} shape nav-visibility
 * checks read. Email is blanked for every non-real preview so per-person
 * allowlists (e.g. a specific official's email hardcoded into a nav gate)
 * don't leak the real account's identity through the simulation.
 */
export function previewToUserFields(preview: PreviewRole): { role: string; official_type: string | null; email: string } {
  switch (preview) {
    case "member":
      return { role: "member", official_type: null, email: "" };
    case "district":
      return { role: "admin", official_type: "district", email: "" };
    case "state":
      return { role: "admin", official_type: "state", email: "" };
    case "super_admin":
      return { role: "super_admin", official_type: null, email: "" };
  }
}
