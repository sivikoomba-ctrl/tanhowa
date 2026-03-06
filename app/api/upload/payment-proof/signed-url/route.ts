import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getDbRole } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { file_path, subscription_id } = await req.json();
  if (!file_path || !subscription_id) {
    return NextResponse.json({ error: "file_path and subscription_id required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Members can only view their own payment proofs; admins can view all
  const role = await getDbRole(session.userId);
  if (role !== "admin") {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("id", subscription_id)
      .single();

    if (!sub || sub.user_id !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Generate a signed URL valid for 5 minutes
  const { data, error } = await supabase.storage
    .from("payment-proofs")
    .createSignedUrl(file_path, 300);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Failed to generate URL" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
