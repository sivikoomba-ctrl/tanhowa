import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const publicPaths = ["/", "/verify", "/api/auth/send-otp", "/api/auth/verify-otp"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and static assets
  if (
    publicPaths.some((p) => pathname === p) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(svg|png|jpg|ico)$/)
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("session")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Verify JWT in middleware
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return NextResponse.next();
  }

  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret);

    // Block admin routes for non-admin users
    if (pathname.startsWith("/admin") && payload.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Block dashboard for pending/rejected users (except onboarding)
    if (pathname.startsWith("/dashboard") && payload.status !== "approved") {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }

    return NextResponse.next();
  } catch {
    // Invalid token — redirect to login
    const response = NextResponse.redirect(new URL("/", req.url));
    response.cookies.delete("session");
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
