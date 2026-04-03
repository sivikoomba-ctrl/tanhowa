import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { isRazorpayConfigured, getRazorpayKeyId, createOrder, verifySignature } from "@/lib/razorpay";

/**
 * POST /api/payments — Create a Razorpay order for a subscription
 * Body: { subscription_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isRazorpayConfigured()) {
      return NextResponse.json({ error: "Online payments are not configured yet" }, { status: 503 });
    }

    const body = await req.json();
    const subscriptionId = body.subscription_id;
    if (!subscriptionId) {
      return NextResponse.json({ error: "subscription_id required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Fetch subscription and verify it belongs to the user
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("id, user_id, period, amount, status")
      .eq("id", subscriptionId)
      .single();

    if (error || !sub) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    if (sub.user_id !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (sub.status === "paid") {
      return NextResponse.json({ error: "Already paid" }, { status: 400 });
    }

    // Create Razorpay order
    const order = await createOrder({
      amount: sub.amount,
      receipt: sub.id,
      notes: {
        subscription_id: sub.id,
        period: sub.period,
        user_id: session.userId,
      },
    });

    // Store order ID on subscription
    await supabase
      .from("subscriptions")
      .update({ razorpay_order_id: order.id })
      .eq("id", sub.id);

    return NextResponse.json({
      order_id: order.id,
      key_id: getRazorpayKeyId(),
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/payments", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create payment order" }, { status: 500 });
  }
}

/**
 * PUT /api/payments — Verify Razorpay payment and mark subscription as paid
 * Body: { subscription_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { subscription_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!subscription_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
    }

    // Verify signature
    const isValid = await verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Verify subscription exists and order matches
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, user_id, razorpay_order_id")
      .eq("id", subscription_id)
      .single();

    if (!sub || sub.user_id !== session.userId) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    if (sub.razorpay_order_id !== razorpay_order_id) {
      return NextResponse.json({ error: "Order mismatch" }, { status: 400 });
    }

    // Mark as paid
    await supabase
      .from("subscriptions")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_method: "razorpay",
        transaction_id: razorpay_payment_id,
        razorpay_payment_id,
        remarks: "Online payment via Razorpay",
      })
      .eq("id", subscription_id);

    return NextResponse.json({ ok: true, message: "Payment verified and subscription marked as paid" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/payments", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to verify payment" }, { status: 500 });
  }
}
