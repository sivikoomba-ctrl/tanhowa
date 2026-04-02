import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("paid_at, period, users!subscriptions_user_id_fkey(name)")
      .eq("status", "paid")
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(20);

    const payments = (data || []).map((s) => ({
      name: (s.users as unknown as { name: string })?.name || "Member",
      period: s.period,
      paid_at: s.paid_at,
    }));

    return NextResponse.json({ payments });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions/recent-payments", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch recent payments" }, { status: 500 });
  }
}
