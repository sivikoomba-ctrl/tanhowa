import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getServiceClient } from "@/lib/supabase";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

// Default admin email — always auto-approved as admin on login
export const DEFAULT_ADMIN_EMAIL = "tanhowaadmin@tanhowa.in";

export interface SessionPayload {
  userId: string;
  email: string;
  role: "member" | "admin";
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
 * Check if the current session user is an admin (verified against DB).
 * Returns true if admin, false otherwise.
 */
export async function isAdmin(session: SessionPayload | null): Promise<boolean> {
  if (!session) return false;
  const role = await getDbRole(session.userId);
  return role === "admin";
}
