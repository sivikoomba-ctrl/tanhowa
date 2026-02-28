import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { createSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const normalizedEmail = email.toLowerCase();

    // Find valid OTP
    const { data: otpRecord, error: otpError } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("email", normalizedEmail)
      .eq("code", code)
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

    if (!user) {
      // Check if this is the very first user (auto-admin)
      const { count } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true });

      const isFirstUser = count === 0;

      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert({
          email: normalizedEmail,
          role: isFirstUser ? "admin" : "member",
          status: isFirstUser ? "approved" : "pending",
        })
        .select()
        .single();

      if (createError || !newUser) {
        return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
      }

      user = newUser;
      isNewUser = true;
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
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
