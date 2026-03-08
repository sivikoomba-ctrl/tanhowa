import { NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";

export async function GET() {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { error: "Google OAuth not configured" },
        { status: 500 }
      );
    }

    // Generate a random state parameter for CSRF protection
    const state = crypto.randomUUID();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      state,
      prompt: "select_account",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    // Set state in a short-lived cookie for CSRF verification
    const response = NextResponse.redirect(authUrl);
    response.cookies.set("oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "auth",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/auth/google",
      method: "GET",
      status_code: 500,
    });
    return NextResponse.json(
      { error: "Failed to initiate Google login" },
      { status: 500 }
    );
  }
}
