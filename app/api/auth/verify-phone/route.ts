import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { sendSmsOtp, verifySmsOtp } from "@/lib/sms";
import { logError } from "@/lib/error-logger";

// POST: Send OTP or verify OTP for phone verification during onboarding
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action, phone, code, sessionId } = await req.json();

    if (action === "send") {
      // Send OTP to phone
      if (!phone) {
        return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
      }

      const smsSessionId = await sendSmsOtp(phone);
      return NextResponse.json({ message: "OTP sent", sessionId: smsSessionId });
    }

    if (action === "verify") {
      // Verify OTP and mark phone as verified
      if (!code || !sessionId) {
        return NextResponse.json({ error: "Code and sessionId are required" }, { status: 400 });
      }

      const isValid = await verifySmsOtp(sessionId, code);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
      }

      // Mark phone as verified in DB
      const supabase = getServiceClient();
      await supabase
        .from("users")
        .update({ phone_verified: true })
        .eq("id", session.userId);

      return NextResponse.json({ message: "Phone verified successfully", verified: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Verify phone error:", msg);
    await logError({ type: "auth", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/auth/verify-phone", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to verify phone. Please try again." }, { status: 500 });
  }
}
