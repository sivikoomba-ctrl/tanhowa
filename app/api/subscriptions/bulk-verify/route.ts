import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { sendSubscriptionApprovedEmail } from "@/lib/mail";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const subscriptionIds = JSON.parse(formData.get("subscription_ids") as string || "[]") as string[];
    const paidAt = formData.get("paid_at") as string || new Date().toISOString();
    const remarks = formData.get("remarks") as string || "";

    if (subscriptionIds.length === 0) {
      return NextResponse.json({ error: "No members selected" }, { status: 400 });
    }

    const supabase = getServiceClient();
    let proofPath: string | null = null;

    // Upload proof image if provided
    if (file) {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json({ error: "Only JPEG, PNG, and WebP images are allowed" }, { status: 400 });
      }
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Image must be under 5MB" }, { status: 400 });
      }

      const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
      proofPath = `bulk-${Date.now()}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("payment-proofs")
        .upload(proofPath, buffer, { contentType: file.type, upsert: true });

      if (uploadError) {
        await logError({ type: "api", message: uploadError.message, path: "/api/subscriptions/bulk-verify", method: "POST", status_code: 500 });
        return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
      }
    }

    // Update all selected subscriptions
    let successCount = 0;
    for (const id of subscriptionIds) {
      const updates: Record<string, string> = {
        status: "paid",
        paid_at: paidAt,
        updated_at: new Date().toISOString(),
      };
      if (proofPath) updates.payment_proof_url = proofPath;
      if (remarks) updates.remarks = remarks;

      const { error } = await supabase
        .from("subscriptions")
        .update(updates)
        .eq("id", id);

      if (!error) successCount++;
    }

    // Send approval email to each verified member
    if (successCount > 0) {
      try {
        const { data: verifiedSubs } = await supabase
          .from("subscriptions")
          .select("period, amount, users(name, email)")
          .in("id", subscriptionIds)
          .eq("status", "paid");

        if (verifiedSubs) {
          for (const sub of verifiedSubs) {
            try {
              const user = sub.users as unknown as { name: string; email: string };
              if (user?.email) {
                await sendSubscriptionApprovedEmail(
                  user.email,
                  user.name || "Member",
                  sub.period,
                  sub.amount || 0
                );
              }
            } catch {
              // Continue sending to others even if one fails
            }
          }
        }
      } catch (emailErr) {
        const emailMsg = emailErr instanceof Error ? emailErr.message : "Email send failed";
        await logError({ type: "api", message: emailMsg, path: "/api/subscriptions/bulk-verify", method: "POST", status_code: 200, metadata: { context: "bulk-approval-email" } });
      }
    }

    return NextResponse.json({ message: `Verified ${successCount} of ${subscriptionIds.length} subscriptions`, count: successCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions/bulk-verify", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Bulk verify failed" }, { status: 500 });
  }
}
