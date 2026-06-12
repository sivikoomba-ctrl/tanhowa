import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecretKey } from "@/lib/jwt-secret";

// API routes that pending/rejected/suspended users CAN access
const ALLOWED_FOR_ALL = [
  "/api/auth/",
  "/api/users/me",
  "/api/error-logs",
  "/api/analytics",
  "/api/subscriptions", // Suspended members can view their subscription history
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only apply to data API routes (not auth, users/me, error-logs)
  if (!pathname.startsWith("/api/")) return NextResponse.next();
  if (ALLOWED_FOR_ALL.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Check JWT
  const token = req.cookies.get("session")?.value;
  if (!token) return NextResponse.next(); // Let individual routes handle 401

  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    const status = (payload as { status?: string }).status;

    // Block pending/rejected/suspended users from data APIs
    if (status && status !== "approved") {
      const msg = status === "suspended" ? "Account suspended" : "Account not approved";
      return NextResponse.json({ error: msg }, { status: 403 });
    }
  } catch {
    // Invalid token — let individual routes handle
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
