import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { createSession, DEFAULT_ADMIN_EMAIL } from "@/lib/auth";
import { verifySmsOtp } from "@/lib/sms";
import { logError } from "@/lib/error-logger";
import { createRateLimiter } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

const verifyMobileOtpLimiter = createRateLimiter(10, 15 * 60 * 1000);

export async function POST(req: NextRequest) {
  try {
    const ip = getRequestIp(req);
    if (!verifyMobileOtpLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many verification attempts. Please wait before trying again." }, { status: 429 });
    }

    const { phone, code, sessionId } = await req.json();

    if (!phone || !code || !sessionId) {
      return NextResponse.json({ error: "Phone, code, and sessionId are required" }, { status: 400 });
    }

    // Verify OTP with 2Factor
    const isValid = await verifySmsOtp(sessionId, code);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
    }

    // Normalize phone for lookup
    const digits = phone.replace(/[\s\-\+\(\)]/g, "");
    const normalized = digits.startsWith("91") && digits.length === 12
      ? digits.slice(2)
      : digits;

    const supabase = getServiceClient();

    // Find user by phone number — try multiple formats
    const phonesToSearch = [normalized, `+91${normalized}`, `91${normalized}`];
    let user = null;

    for (const p of phonesToSearch) {
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("phone", p)
        .single();
      if (data) {
        user = data;
        break;
      }
    }

    // Also try partial match (phone field may contain spaces/dashes)
    if (!user) {
      const { data } = await supabase
        .from("users")
        .select("*")
        .ilike("phone", `%${normalized}%`);
      if (data && data.length === 1) {
        user = data[0];
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: "No account found with this mobile number. Please sign up with Google or Email first." },
        { status: 404 }
      );
    }

    // Auto-promote default admin email to super_admin if needed
    if (user.email === DEFAULT_ADMIN_EMAIL && (user.role !== "super_admin" || user.status !== "approved")) {
      await supabase.from("users").update({ role: "super_admin", status: "approved" }).eq("id", user.id);
      user = { ...user, role: "super_admin", status: "approved" };
    }

    // Update last login timestamp, increment login count, mark phone verified
    const newLoginCount = (user.login_count || 0) + 1;
    await supabase.from("users").update({
      last_login_at: new Date().toISOString(),
      login_count: newLoginCount,
      phone_verified: true,
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
      isNewUser: false,
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
    console.error("Verify mobile OTP error:", msg);
    await logError({ type: "auth", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/auth/verify-mobile-otp", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
