import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

// GET: fetch RSVP counts per event + current user's RSVPs
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const url = new URL(req.url);
  const eventId = url.searchParams.get("event_id");

  if (eventId) {
    // Get RSVPs for a specific event with user names
    const { data } = await supabase
      .from("event_rsvps")
      .select("user_id, status, users!event_rsvps_user_id_fkey(name)")
      .eq("event_id", eventId);
    return NextResponse.json({ rsvps: data || [] });
  }

  // Get all RSVP counts + user's own RSVPs
  const { data: allRsvps } = await supabase
    .from("event_rsvps")
    .select("event_id, user_id, status");

  const counts: Record<string, number> = {};
  const myRsvps: Record<string, string> = {};
  for (const r of allRsvps || []) {
    if (r.status === "going") counts[r.event_id] = (counts[r.event_id] || 0) + 1;
    if (r.user_id === session.userId) myRsvps[r.event_id] = r.status;
  }

  return NextResponse.json({ counts, myRsvps });
}

// POST: RSVP to an event
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { event_id, status } = await req.json();
  if (!event_id) return NextResponse.json({ error: "event_id required" }, { status: 400 });

  const supabase = getServiceClient();

  if (status === "cancel") {
    await supabase
      .from("event_rsvps")
      .delete()
      .eq("event_id", event_id)
      .eq("user_id", session.userId);
    return NextResponse.json({ ok: true });
  }

  await supabase
    .from("event_rsvps")
    .upsert(
      { event_id, user_id: session.userId, status: status || "going" },
      { onConflict: "event_id,user_id" }
    );

  return NextResponse.json({ ok: true });
}
