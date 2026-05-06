import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { sendOTPEmail } from "@/lib/mail";
import { logError } from "@/lib/error-logger";
import { createRateLimiter } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

const OTP_PURPOSE = "finance_access";
const sendLimiter = createRateLimiter(5, 15 * 60 * 1000);
const verifyLimiter = createRateLimiter(10, 15 * 60 * 1000);

// POST — send OTP for finance access
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getRequestIp(req);
    if (!sendLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many OTP requests. Please wait." }, { status: 429 });
    }

    const otpNum = crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000;
    const otp = otpNum.toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const supabase = getServiceClient();

    // Invalidate old finance OTPs
    await supabase
      .from("otp_codes")
      .update({ used: true })
      .eq("email", session.email)
      .eq("purpose", OTP_PURPOSE)
      .eq("used", false);

    // Store hashed OTP
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(otp));
    const hashedOtp = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

    const { error: dbError } = await supabase.from("otp_codes").insert({
      email: session.email,
      code: hashedOtp,
      purpose: OTP_PURPOSE,
      expires_at: expiresAt.toISOString(),
    });

    if (dbError) {
      return NextResponse.json({ error: "Failed to generate OTP" }, { status: 500 });
    }

    await sendOTPEmail(session.email, otp);

    return NextResponse.json({ message: "OTP sent" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "auth", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/auth/finance-otp", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
  }
}

// PUT — verify OTP for finance access
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getRequestIp(req);
    if (!verifyLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many attempts. Please wait." }, { status: 429 });
    }

    const { code } = await req.json();
    if (!code) {
      return NextResponse.json({ error: "OTP code is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(code));
    const hashedCode = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

    const { data: otpRecord, error: otpError } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("email", session.email)
      .eq("code", hashedCode)
      .eq("purpose", OTP_PURPOSE)
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

    return NextResponse.json({ verified: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "auth", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/auth/finance-otp", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
