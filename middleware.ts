import { NextRequest, NextResponse } from "next/server";

const publicPaths = ["/", "/verify", "/api/auth/send-otp", "/api/auth/verify-otp"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths, static assets, and API routes
  if (
    publicPaths.some((p) => pathname === p) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(svg|png|jpg|ico|css|js)$/)
  ) {
    return NextResponse.next();
  }

  // Check for session cookie (actual JWT verification happens in API routes)
  const token = req.cookies.get("session")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
