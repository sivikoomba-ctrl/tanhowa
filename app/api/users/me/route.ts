import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", session.userId)
    .single();

  return NextResponse.json({ user });
}

function validatePhone(phone: string): boolean {
  const digits = phone.replace(/[\s\-\+\(\)]/g, "");
  return /^(91)?[6-9]\d{9}$/.test(digits);
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const supabase = getServiceClient();

  // Server-side mandatory field validation
  const name = typeof body.name === "string" ? body.name.trim().toUpperCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const occupation = typeof body.occupation === "string" ? body.occupation.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
  }
  if (!validatePhone(phone)) {
    return NextResponse.json({ error: "Enter a valid Indian mobile number (10 digits starting with 6-9)" }, { status: 400 });
  }
  if (!occupation) {
    return NextResponse.json({ error: "Designation is required" }, { status: 400 });
  }

  // Duplicate phone check (exclude current user)
  const { data: existingPhone } = await supabase
    .from("users")
    .select("id")
    .eq("phone", phone)
    .neq("id", session.userId)
    .limit(1)
    .single();

  if (existingPhone) {
    return NextResponse.json({ error: "This phone number is already registered with another account" }, { status: 400 });
  }

  // DOB validation (if provided)
  const dob = body.dob || null;
  if (dob) {
    const dobDate = new Date(dob);
    const now = new Date();
    const age = now.getFullYear() - dobDate.getFullYear();
    if (dobDate > now || age > 100 || age < 18) {
      return NextResponse.json({ error: "Date of birth must be between 18 and 100 years" }, { status: 400 });
    }
  }

  const { error } = await supabase
    .from("users")
    .update({
      name,
      phone,
      address: body.address || "",
      dob,
      occupation,
      photo_url: body.photo_url || "",
      social_links: body.social_links || {},
      posting_details: body.posting_details || {},
    })
    .eq("id", session.userId);

  if (error) {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }

  return NextResponse.json({ message: "Profile updated" });
}
