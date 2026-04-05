import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isAdminOrOfficial } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { createRateLimiter } from "@/lib/rate-limit";

const uploadLimiter = createRateLimiter(10);

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!uploadLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many uploads. Please wait." }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const subscriptionId = formData.get("subscription_id") as string | null;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Only JPEG, PNG, and WebP images are allowed" }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be under 5MB" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const admin = await isAdmin(session);
    const adminOrOfficial = await isAdminOrOfficial(session);

    // Verify the subscription belongs to this user, or user is admin/official
    if (!admin && !adminOrOfficial) {
      if (!subscriptionId) {
        return NextResponse.json({ error: "subscription_id required" }, { status: 400 });
      }
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("id", subscriptionId)
        .single();

      if (!sub || sub.user_id !== session.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const prefix = subscriptionId || `admin-${session.userId}`;
    const fileName = `${prefix}-${Date.now()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      await logError({ type: "api", message: uploadError.message, path: "/api/upload/payment-proof", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
    }

    // Store the file path (not public URL) since bucket is private
    if (subscriptionId) {
      await supabase
        .from("subscriptions")
        .update({ payment_proof_url: fileName, updated_at: new Date().toISOString() })
        .eq("id", subscriptionId);
    }

    return NextResponse.json({ payment_proof_url: fileName });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/upload/payment-proof", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
