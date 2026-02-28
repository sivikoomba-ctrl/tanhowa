import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  const [membersRes, announcementsRes, eventsRes, documentsRes] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("announcements").select("id", { count: "exact", head: true }).eq("published", true),
    supabase.from("events").select("id", { count: "exact", head: true }),
    supabase.from("documents").select("id", { count: "exact", head: true }),
  ]);

  return NextResponse.json({
    members: membersRes.count || 0,
    announcements: announcementsRes.count || 0,
    events: eventsRes.count || 0,
    documents: documentsRes.count || 0,
  });
}
