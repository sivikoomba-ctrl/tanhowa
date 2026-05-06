import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { createSession, DEFAULT_ADMIN_EMAIL, SUPER_ADMIN_EMAILS, isBlockedEmail } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { createRateLimiter } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

const OTP_PURPOSE_LOGIN = "login";
const verifyOtpLimiter = createRateLimiter(10, 15 * 60 * 1000);

export async function POST(req: NextRequest) {
  try {
    const ip = getRequestIp(req);
    if (!verifyOtpLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many verification attempts. Please wait before trying again." }, { status: 429 });
    }

    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
    }

    // Block government/official email addresses
    if (isBlockedEmail(email)) {
      return NextResponse.json({ error: "Government/official email addresses are not allowed. Please use your personal email." }, { status: 403 });
    }

    const supabase = getServiceClient();
    const normalizedEmail = email.toLowerCase();

    // Hash the submitted code for comparison
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(code));
    const hashedCode = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

    // Find valid OTP
    const { data: otpRecord, error: otpError } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("email", normalizedEmail)
      .eq("code", hashedCode)
      .eq("purpose", OTP_PURPOSE_LOGIN)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otpRecord) {
      return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
    }

    // Mark OTP as used
    await supabase.from("otp_codes").update({ used: true }).eq("id", otpRecord.id);

    // Check if user exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .eq("email", normalizedEmail)
      .single();

    let user = existingUser;
    let isNewUser = false;

    // Auto-promote super admin emails to super_admin if not already
    if (user && SUPER_ADMIN_EMAILS.has(normalizedEmail) && (user.role !== "super_admin" || user.status !== "approved")) {
      await supabase.from("users").update({ role: "super_admin", status: "approved" }).eq("id", user.id);
      user = { ...user, role: "super_admin", status: "approved" };
    }

    if (!user) {
      // Auto-admin: first user OR the default admin email
      const isDefaultAdmin = SUPER_ADMIN_EMAILS.has(normalizedEmail);
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
          role: isDefaultAdmin ? "super_admin" : (isFirstUser ? "admin" : "member"),
          status: autoAdmin ? "approved" : "pending",
        })
        .select()
        .single();

      if (createError || !newUser) {
        return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
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
      return NextResponse.json({ error: "account_deleted_incomplete_profile" }, { status: 403 });
    }

    // Create session
    await createSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    });

    return NextResponse.json({
      message: "Verified successfully",
      isNewUser,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        occupation: user.occupation,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Verify OTP error:", msg);
    await logError({ type: "auth", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/auth/verify-otp", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
