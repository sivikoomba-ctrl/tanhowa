import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { createSession, DEFAULT_ADMIN_EMAIL } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
}

interface GoogleUserInfo {
  email: string;
  name?: string;
  picture?: string;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // User denied access or other Google error
    if (error) {
      return NextResponse.redirect(new URL("/?error=access_denied", req.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL("/?error=no_code", req.url));
    }

    // Verify CSRF state
    const savedState = req.cookies.get("oauth_state")?.value;
    if (!savedState || savedState !== state) {
      return NextResponse.redirect(new URL("/?error=invalid_state", req.url));
    }

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI!;

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL("/?error=token_exchange_failed", req.url));
    }

    const tokenData: GoogleTokenResponse = await tokenRes.json();

    // Get user info from Google
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {
      return NextResponse.redirect(new URL("/?error=userinfo_failed", req.url));
    }

    const googleUser: GoogleUserInfo = await userInfoRes.json();
    const normalizedEmail = googleUser.email.toLowerCase();

    const supabase = getServiceClient();

    // Check if user exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .eq("email", normalizedEmail)
      .single();

    let user = existingUser;
    let isNewUser = false;

    // Auto-promote default admin email to super_admin if not already
    if (user && normalizedEmail === DEFAULT_ADMIN_EMAIL && (user.role !== "super_admin" || user.status !== "approved")) {
      await supabase.from("users").update({ role: "super_admin", status: "approved" }).eq("id", user.id);
      user = { ...user, role: "super_admin", status: "approved" };
    }

    if (!user) {
      // Auto-admin: first user OR the default admin email
      const isDefaultAdmin = normalizedEmail === DEFAULT_ADMIN_EMAIL;
      let isFirstUser = false;
      if (!isDefaultAdmin) {
        const { count } = await supabase
          .from("users")
          .select("*", { count: "exact", head: true });
        isFirstUser = count === 0;
      }

      const autoAdmin = isDefaultAdmin || isFirstUser;

      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert({
          email: normalizedEmail,
          name: googleUser.name || "",
          avatar_url: googleUser.picture || "",
          role: isDefaultAdmin ? "super_admin" : (isFirstUser ? "admin" : "member"),
          status: autoAdmin ? "approved" : "pending",
        })
        .select()
        .single();

      if (createError || !newUser) {
        return NextResponse.redirect(new URL("/?error=account_creation_failed", req.url));
      }

      user = newUser;
      isNewUser = true;
    }

    // Update last login timestamp and increment login count
    const newLoginCount = (user.login_count || 0) + 1;
    await supabase.from("users").update({
      last_login_at: new Date().toISOString(),
      login_count: newLoginCount,
    }).eq("id", user.id);

    // Auto-delete accounts that never completed profile after 7+ logins
    if (newLoginCount >= 7 && !user.name && user.role !== "admin" && user.role !== "super_admin") {
      await supabase.from("users").delete().eq("id", user.id);
      return NextResponse.redirect(new URL("/?error=account_deleted_incomplete_profile", req.url));
    }

    // Create session (same JWT as OTP flow)
    await createSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    });

    // Clear the OAuth state cookie
    const baseUrl = new URL(req.url).origin;
    let redirectPath: string;

    if (user.role === "super_admin") {
      redirectPath = "/dashboard";
    } else if (isNewUser || !user.name || !user.phone || !user.occupation) {
      redirectPath = "/onboarding";
    } else if (user.status === "approved") {
      redirectPath = "/dashboard";
    } else if (user.status === "pending") {
      redirectPath = "/pending";
    } else {
      redirectPath = "/onboarding";
    }

    const response = NextResponse.redirect(new URL(redirectPath, baseUrl));
    response.cookies.delete("oauth_state");
    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Google OAuth callback error:", msg);
    await logError({
      type: "auth",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/auth/google/callback",
      method: "GET",
      status_code: 500,
    });
    return NextResponse.redirect(new URL("/?error=auth_failed", req.url));
  }
}
