/**
 * Signed token used in the inactive-nudge email's "tell us why" link.
 * Lets a member submit one feedback row without logging in.
 * 30-day expiry — if they wait longer, the email link silently invalidates
 * and they'll need a fresh nudge email.
 */
import { SignJWT } from "jose";
import { getJwtSecretKey } from "@/lib/jwt-secret";

export async function createFeedbackToken(userId: string): Promise<string> {
  return await new SignJWT({ userId, purpose: "feedback" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(getJwtSecretKey());
}

export function buildFeedbackLink(baseUrl: string, token: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  return `${trimmed}/feedback?t=${encodeURIComponent(token)}`;
}
