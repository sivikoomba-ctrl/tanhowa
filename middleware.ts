import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

// API routes that pending/rejected users CAN access (auth, profile, error logging)
const ALLOWED_FOR_ALL = [
  "/api/auth/",
  "/api/users/me",
  "/api/error-logs",
  "/api/analytics",
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
    const { payload } = await jwtVerify(token, secret);
    const status = (payload as { status?: string }).status;

    // Block pending/rejected users from data APIs
    if (status && status !== "approved") {
      return NextResponse.json({ error: "Account not approved" }, { status: 403 });
    }
  } catch {
    // Invalid token — let individual routes handle
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
