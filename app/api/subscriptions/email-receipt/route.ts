import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { sendReceiptEmail } from "@/lib/mail";
import { logError } from "@/lib/error-logger";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { subscriptionId } = await req.json();
    if (!subscriptionId) {
      return NextResponse.json({ error: "Subscription ID required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Fetch subscription with user details — only allow own subscriptions
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, period, amount, status, paid_at, payment_method, transaction_id, user_id, users!subscriptions_user_id_fkey(name, email, phone)")
      .eq("id", subscriptionId)
      .eq("user_id", session.userId)
      .single();

    if (!sub) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    if (sub.status !== "paid") {
      return NextResponse.json({ error: "Receipt is only available for paid subscriptions" }, { status: 400 });
    }

    const user = sub.users as unknown as { name: string; email: string; phone?: string };

    await sendReceiptEmail(
      user.email,
      user.name || "Member",
      sub.period,
      sub.amount || 0,
      {
        phone: user.phone,
        payment_method: sub.payment_method,
        transaction_id: sub.transaction_id,
        paid_at: sub.paid_at,
      },
    );

    return NextResponse.json({ message: "Receipt emailed" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions/email-receipt", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to email receipt" }, { status: 500 });
  }
}
