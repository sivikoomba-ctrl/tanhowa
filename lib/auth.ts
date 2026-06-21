import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getServiceClient } from "@/lib/supabase";
import { getJwtSecretKey } from "@/lib/jwt-secret";

// Default admin email — always auto-approved as admin on login
export const DEFAULT_ADMIN_EMAIL = "tanhowaadmin@tanhowa.in";
export const SYSTEM_ADMIN_EMAIL = "tanhowa19791@gmail.com";
export const SUPER_ADMIN_EMAILS = new Set([DEFAULT_ADMIN_EMAIL, SYSTEM_ADMIN_EMAIL]);

// Blocked government email domains and patterns
const BLOCKED_EMAIL_DOMAINS = ["tn.gov.in", "nic.in", "gov.in"];
// Designation / institution keywords that signal an OFFICIAL account, not a personal one.
// Members must register with their personal email so they retain access after transfers/role changes.
const BLOCKED_EMAIL_KEYWORDS = [
  "adh", "ddh", "jdh", "addh", "ho",       // designation-based
  "dho", "ado", "jdo",                       // alternate designation prefixes
  "coe",                                     // Centre of Excellence (TN horticulture)
  "tanhoda",                                 // TANHODA = TN Horticulture Development Agency
];

/** Returns true if the email is a government/official email that should be blocked */
export function isBlockedEmail(email: string): boolean {
  const lower = email.toLowerCase();
  // Super admin emails are never blocked
  if (SUPER_ADMIN_EMAILS.has(lower)) return false;
  const domain = lower.split("@")[1] || "";
  // Block entire government domains
  if (BLOCKED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) return true;
  // Block designation/institution keywords as a separate "word" in the local part.
  // Splitting on common separators avoids false positives like "madhuri" matching "adh"
  // or "padhma" matching "adh", while still catching adh.kannan / kannan-adh / adh1234 / coe_tnj.
  const localPart = lower.split("@")[0] || "";
  const segments = localPart.split(/[._\-+0-9]+/).filter(Boolean);
  if (BLOCKED_EMAIL_KEYWORDS.some((kw) => segments.includes(kw))) return true;
  return false;
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: "member" | "admin" | "super_admin";
  status: "pending" | "approved" | "rejected";
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(getJwtSecretKey());

  const cookieStore = await cookies();
  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return token;
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

/**
 * Get the user's current role from the database (not JWT).
 * Use this instead of session.role for admin checks — JWT role may be stale.
 */
export async function getDbRole(userId: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role || null;
}

/**
 * Get the user's official_type from the database.
 * Returns "state", "district", or null.
 */
export async function getOfficialType(userId: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("users")
    .select("official_type")
    .eq("id", userId)
    .single();
  return data?.official_type || null;
}

/**
 * Get the user's official details: type, role, and district.
 * Used for district-level authorization (e.g., subscription verification).
 */
export async function getOfficialInfo(userId: string): Promise<{ role: string; official_type: string | null; district: string | null }> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("users")
    .select("role, official_type, posting_details")
    .eq("id", userId)
    .single();
  if (!data) return { role: "member", official_type: null, district: null };
  const pd = data.posting_details as { regular_district?: string } | null;
  return {
    role: data.role || "member",
    official_type: data.official_type || null,
    district: pd?.regular_district || null,
  };
}

/**
 * Check if the user is a state or district official (or admin/super_admin).
 * Used for features shared between admins and officials.
 */
export async function isAdminOrOfficial(session: SessionPayload | null): Promise<boolean> {
  if (!session) return false;
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("users")
    .select("role, official_type")
    .eq("id", session.userId)
    .single();
  if (!data) return false;
  return data.role === "admin" || data.role === "super_admin" || data.official_type === "state" || data.official_type === "district" || data.official_type === "volunteer";
}

/**
 * Check if the current session user is an admin or super_admin (verified against DB).
 * Returns true if admin or super_admin, false otherwise.
 */
export async function isAdmin(session: SessionPayload | null): Promise<boolean> {
  if (!session) return false;
  const role = await getDbRole(session.userId);
  return role === "admin" || role === "super_admin";
}

/**
 * Check if the current session user is a super_admin (verified against DB).
 */
export async function isSuperAdmin(session: SessionPayload | null): Promise<boolean> {
  if (!session) return false;
  const role = await getDbRole(session.userId);
  return role === "super_admin";
}

/**
 * Election management/participation access. The whole Elections area (manage,
 * nominate, vote) is restricted to super_admins, state officials, and the owner.
 * Keep this in sync with the `electionsOnly` nav gate in app/dashboard/layout.tsx.
 */
const ELECTION_ALLOWED_EMAILS = ["sivikoomba@gmail.com"];
export async function hasElectionAccess(session: SessionPayload | null): Promise<boolean> {
  if (!session) return false;
  if (ELECTION_ALLOWED_EMAILS.includes(session.email)) return true;
  if (await isSuperAdmin(session)) return true;
  return (await getOfficialType(session.userId)) === "state";
}

/**
 * Check if a user is a member of the Finance Team.
 * Matches team name case-insensitively containing "finance".
 */
export async function isFinanceTeamMember(userId: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .ilike("name", "%finance%");
  if (!teams || teams.length === 0) return false;
  const teamIds = teams.map((t) => t.id);
  const { data: membership } = await supabase
    .from("team_members")
    .select("id")
    .eq("user_id", userId)
    .in("team_id", teamIds)
    .limit(1);
  return !!membership && membership.length > 0;
}

/**
 * Check if a user is a TT Team member — grants access to Project H (policy vault).
 */
export async function isProjectHMember(userId: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("name", "TT Team");
  if (!teams || teams.length === 0) return false;
  const teamIds = teams.map((t) => t.id);
  const { data: membership } = await supabase
    .from("team_members")
    .select("id")
    .eq("user_id", userId)
    .in("team_id", teamIds)
    .limit(1);
  return !!membership && membership.length > 0;
}
