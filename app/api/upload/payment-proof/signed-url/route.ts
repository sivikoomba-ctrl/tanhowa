import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getDbRole } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subscription_id } = await req.json();
  if (!subscription_id) {
    return NextResponse.json({ error: "subscription_id required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("user_id, payment_proof_url")
    .eq("id", subscription_id)
    .single();

  if (!sub || !sub.payment_proof_url) {
    return NextResponse.json({ error: "Payment proof not found" }, { status: 404 });
  }

  // Members can only view their own; admins and officials can view all
  const role = await getDbRole(session.userId);
  const isAdminOrOfficial = role === "admin" || role === "super_admin";
  if (!isAdminOrOfficial && sub.user_id !== session.userId) {
    // Check if user is an official
    const { data: user } = await supabase
      .from("users")
      .select("official_type")
      .eq("id", session.userId)
      .single();
    if (!user?.official_type) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Generate a signed URL valid for 5 minutes
  const { data, error } = await supabase.storage
    .from("payment-proofs")
    .createSignedUrl(sub.payment_proof_url, 300);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Failed to generate URL" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
