import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { createSession, DEFAULT_ADMIN_EMAIL } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

interface FacebookTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface FacebookUserInfo {
  id: string;
  name?: string;
  email?: string;
  picture?: {
    data: {
      url: string;
      is_silhouette: boolean;
    };
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // User denied access or other Facebook error
    if (error) {
      return NextResponse.redirect(new URL("/?error=fb_access_denied", req.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL("/?error=fb_no_code", req.url));
    }

    // Verify CSRF state
    const savedState = req.cookies.get("fb_oauth_state")?.value;
    if (!savedState || savedState !== state) {
      return NextResponse.redirect(new URL("/?error=invalid_state", req.url));
    }

    const appId = process.env.FACEBOOK_APP_ID!;
    const appSecret = process.env.FACEBOOK_APP_SECRET!;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI!;

    // Exchange authorization code for access token
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?${tokenParams.toString()}`
    );

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL("/?error=fb_token_exchange_failed", req.url));
    }

    const tokenData: FacebookTokenResponse = await tokenRes.json();

    // Get user info from Facebook
    const userInfoRes = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${tokenData.access_token}`
    );

    if (!userInfoRes.ok) {
      return NextResponse.redirect(new URL("/?error=fb_userinfo_failed", req.url));
    }

    const fbUser: FacebookUserInfo = await userInfoRes.json();

    // Facebook may not return email if user hasn't verified it or denied permission
    if (!fbUser.email) {
      return NextResponse.redirect(new URL("/?error=fb_no_email", req.url));
    }

    const normalizedEmail = fbUser.email.toLowerCase();
    const photoUrl = fbUser.picture?.data?.is_silhouette ? "" : (fbUser.picture?.data?.url || "");

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
          name: fbUser.name || "",
          photo_url: photoUrl,
          role: isDefaultAdmin ? "super_admin" : (isFirstUser ? "admin" : "member"),
          status: autoAdmin ? "approved" : "pending",
        })
        .select()
        .single();

      if (createError || !newUser) {
        await logError({
          type: "auth",
          message: `Facebook account creation failed: ${createError?.message || "No user returned"}`,
          stack: createError?.details || createError?.hint || "",
          path: "/api/auth/facebook/callback",
          method: "GET",
          status_code: 500,
          metadata: { email: normalizedEmail, code: createError?.code },
        });
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

    // Create session (same JWT as Google/OTP flow)
    await createSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    });

    // Clear the OAuth state cookie and redirect
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
    response.cookies.delete("fb_oauth_state");
    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Facebook OAuth callback error:", msg);
    await logError({
      type: "auth",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/auth/facebook/callback",
      method: "GET",
      status_code: 500,
    });
    return NextResponse.redirect(new URL("/?error=auth_failed", req.url));
  }
}
