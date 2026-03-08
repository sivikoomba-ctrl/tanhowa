import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET() {
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
}
