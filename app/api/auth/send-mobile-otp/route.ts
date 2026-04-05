import { NextRequest, NextResponse } from "next/server";
import { sendSmsOtp } from "@/lib/sms";
import { logError } from "@/lib/error-logger";
import { createRateLimiter } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

const sendMobileOtpLimiter = createRateLimiter(5, 15 * 60 * 1000);

export async function POST(req: NextRequest) {
  try {
    const ip = getRequestIp(req);
    if (!sendMobileOtpLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many OTP requests. Please wait before trying again." }, { status: 429 });
    }

    const { phone } = await req.json();

    if (!phone) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    // Normalize phone for validation
    const digits = phone.replace(/[\s\-\+\(\)]/g, "");
    const normalized = digits.startsWith("91") && digits.length === 12
      ? digits.slice(2)
      : digits;

    if (!/^[6-9]\d{9}$/.test(normalized)) {
      return NextResponse.json({ error: "Enter a valid Indian mobile number (10 digits starting with 6-9)" }, { status: 400 });
    }

    const sessionId = await sendSmsOtp(phone);

    return NextResponse.json({ message: "OTP sent successfully", sessionId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Send mobile OTP error:", msg);
    await logError({ type: "auth", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/auth/send-mobile-otp", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to send OTP. Please try again." }, { status: 500 });
  }
}
