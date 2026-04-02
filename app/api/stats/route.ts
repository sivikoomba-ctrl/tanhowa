import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const { searchParams } = new URL(req.url);
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    const [membersRes, announcementsRes, eventsRes, documentsRes] = await Promise.all([
      supabase.from("users").select("id", { count: "exact", head: true }).eq("status", "approved"),
      supabase.from("announcements").select("id", { count: "exact", head: true }).eq("published", true),
      supabase.from("events").select("id", { count: "exact", head: true }),
      supabase.from("documents").select("id", { count: "exact", head: true }),
    ]);

    // Payment collection stats with optional date range
    let paymentQuery = supabase
      .from("subscriptions")
      .select("amount")
      .eq("status", "paid");

    if (fromDate) paymentQuery = paymentQuery.gte("paid_at", fromDate);
    if (toDate) paymentQuery = paymentQuery.lte("paid_at", toDate + "T23:59:59.999Z");

    const { data: payments } = await paymentQuery;
    const totalCollection = (payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalPayments = (payments || []).length;

    // Admin contacts
    const { data: admins } = await supabase
      .from("users")
      .select("id, name, email, phone, photo_url, occupation")
      .in("role", ["admin", "super_admin"])
      .eq("status", "approved")
      .order("name");

    return NextResponse.json({
      members: membersRes.count || 0,
      announcements: announcementsRes.count || 0,
      events: eventsRes.count || 0,
      documents: documentsRes.count || 0,
      totalCollection,
      totalPayments,
      admins: admins || [],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/stats", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
