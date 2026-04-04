import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getServiceClient } from "@/lib/supabase";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

// Default admin email — always auto-approved as admin on login
export const DEFAULT_ADMIN_EMAIL = "tanhowaadmin@tanhowa.in";

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
    .sign(secret);

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
    const { payload } = await jwtVerify(token, secret);
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
