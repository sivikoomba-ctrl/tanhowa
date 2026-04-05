import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { sendOTPEmail } from "@/lib/mail";
import { logError } from "@/lib/error-logger";
import { createRateLimiter } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

const OTP_PURPOSE_LOGIN = "login";
const sendOtpLimiter = createRateLimiter(5, 15 * 60 * 1000);

export async function POST(req: NextRequest) {
  try {
    const ip = getRequestIp(req);
    if (!sendOtpLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many OTP requests. Please wait before trying again." }, { status: 429 });
    }

    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const supabase = getServiceClient();

    // Invalidate old OTPs for this email
    await supabase
      .from("otp_codes")
      .update({ used: true })
      .eq("email", email.toLowerCase())
      .eq("purpose", OTP_PURPOSE_LOGIN)
      .eq("used", false);

    // Store new OTP
    const { error: dbError } = await supabase.from("otp_codes").insert({
      email: email.toLowerCase(),
      code: otp,
      purpose: OTP_PURPOSE_LOGIN,
      expires_at: expiresAt.toISOString(),
    });

    if (dbError) {
      return NextResponse.json({ error: "Failed to generate OTP" }, { status: 500 });
    }

    // Send OTP via Zoho SMTP
    await sendOTPEmail(email.toLowerCase(), otp);

    return NextResponse.json({ message: "OTP sent successfully" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Send OTP error:", msg);
    await logError({ type: "auth", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/auth/send-otp", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to send OTP. Please try again." }, { status: 500 });
  }
}
