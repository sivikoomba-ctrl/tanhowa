import { NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";

export async function GET() {
  try {
    const appId = process.env.FACEBOOK_APP_ID;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI;

    if (!appId || !redirectUri) {
      return NextResponse.json(
        { error: "Facebook OAuth not configured" },
        { status: 500 }
      );
    }

    // Generate a random state parameter for CSRF protection
    const state = crypto.randomUUID();

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: "email,public_profile",
      response_type: "code",
      state,
    });

    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;

    // Set state in a short-lived cookie for CSRF verification
    const response = NextResponse.redirect(authUrl);
    response.cookies.set("fb_oauth_state", state, {
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
      path: "/api/auth/facebook",
      method: "GET",
      status_code: 500,
    });
    return NextResponse.json(
      { error: "Failed to initiate Facebook login" },
      { status: 500 }
    );
  }
}
