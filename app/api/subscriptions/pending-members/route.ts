import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

// Returns pending/overdue subscriptions for a given period with member info
// Used by members to pick who they're paying on behalf of
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const period = new URL(req.url).searchParams.get("period");
    if (!period) {
      return NextResponse.json({ error: "period is required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("id, user_id, period, amount, status, users!subscriptions_user_id_fkey(id, name, email, phone)")
      .eq("period", period)
      .in("status", ["pending", "overdue"])
      .neq("user_id", session.userId)
      .order("created_at", { ascending: false });

    return NextResponse.json({ subscriptions: data || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions/pending-members", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch pending members" }, { status: 500 });
  }
}
