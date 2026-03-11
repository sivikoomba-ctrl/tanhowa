import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

// Returns pending/overdue subscriptions for a given period with member info
// Used by members to pick who they're paying on behalf of
export async function GET(req: NextRequest) {
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
}
