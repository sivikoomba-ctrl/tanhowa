// Single source of truth for the three features sharing the grievances table.
// The SQL trigger in supabase/ticket_numbers.sql mirrors this list — keep in sync.

export const SERVICE_REQUEST_CATEGORIES = [
  "Transfer", "Training", "Legal Help", "Certificate", "Letter/Recommendation", "Welfare", "IT Support", "Other Service",
] as const;

export const GRIEVANCE_CATEGORIES = ["Personal", "District-All", "District-Specific", "Technical"] as const;

// Legacy grievance categories still present on old rows / cached clients
export const LEGACY_GRIEVANCE_CATEGORIES = ["General", "Administrative", "Others"] as const;

// Everything that isn't a suggestion or service request is a grievance
export function isGrievanceCategory(category: string | null): boolean {
  return category !== "Suggestion" && !SERVICE_REQUEST_CATEGORIES.includes(category as typeof SERVICE_REQUEST_CATEGORIES[number]);
}

// Grievances are handled by state officials and the super admin;
// district admins get their own district's rows only.
export function hasGrievanceAccess(info: { role: string; official_type: string | null }): boolean {
  return info.role === "super_admin" || info.official_type === "state";
}
