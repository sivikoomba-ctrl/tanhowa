import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

// POST — save push subscription
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { subscription } = await req.json();
    if (!subscription?.endpoint) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Upsert push subscription for this user
    await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: session.userId,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    return NextResponse.json({ message: "Subscribed" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/push", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// DELETE — remove push subscription
export async function DELETE() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", session.userId);

    return NextResponse.json({ message: "Unsubscribed" });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
