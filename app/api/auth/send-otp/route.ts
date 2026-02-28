import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { sendOTPEmail } from "@/lib/mail";

export async function POST(req: NextRequest) {
  try {
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
      .eq("used", false);

    // Store new OTP
    const { error: dbError } = await supabase.from("otp_codes").insert({
      email: email.toLowerCase(),
      code: otp,
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
    return NextResponse.json({ error: "Failed to send OTP: " + msg }, { status: 500 });
  }
}
