import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";
import { governanceGate as gate } from "@/lib/governance-auth";

/**
 * Upsert one member's attendance/RSVP for a meeting. Body:
 * { meetingId, userId, rsvp?, attended?, role_at_meeting? }
 */
export async function PUT(req: NextRequest) {
  try {
    const g = await gate();
    if (!g.ok) return g.res;
    const body = await req.json();
    if (!body.meetingId || !body.userId) {
      return NextResponse.json({ error: "Meeting ID and user ID required" }, { status: 400 });
    }
    const supabase = getServiceClient();
    const row: Record<string, unknown> = {
      meeting_id: body.meetingId,
      user_id: body.userId,
      marked_at: new Date().toISOString(),
    };
    if (body.rsvp !== undefined) row.rsvp = body.rsvp;
    if (body.attended !== undefined) row.attended = !!body.attended;
    if (body.role_at_meeting !== undefined) row.role_at_meeting = body.role_at_meeting;
    const { error } = await supabase
      .from("meeting_attendance")
      .upsert(row, { onConflict: "meeting_id,user_id" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/meetings/attendance", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to mark attendance" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const g = await gate();
    if (!g.ok) return g.res;
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Attendance row ID required" }, { status: 400 });
    const supabase = getServiceClient();
    const { error } = await supabase.from("meeting_attendance").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/meetings/attendance", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to remove attendance" }, { status: 500 });
  }
}
