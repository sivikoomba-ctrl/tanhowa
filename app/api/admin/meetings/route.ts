import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";
import { logAudit } from "@/lib/audit-log";
import { governanceGate as gate } from "@/lib/governance-auth";

const MEETING_FIELDS = ["title", "type", "description", "scheduled_at", "location", "mode", "meeting_link", "status", "quorum_required", "minutes"] as const;

export async function GET(req: NextRequest) {
  try {
    const g = await gate();
    if (!g.ok) return g.res;
    const supabase = getServiceClient();
    const id = new URL(req.url).searchParams.get("id");

    if (id) {
      const { data: meeting, error } = await supabase.from("meetings").select("*").eq("id", id).single();
      if (error || !meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const [agendaRes, attRes] = await Promise.all([
        supabase.from("meeting_agenda").select("*").eq("meeting_id", id).order("order_index", { ascending: true }),
        supabase.from("meeting_attendance").select("*, user:user_id(name, email)").eq("meeting_id", id),
      ]);
      const attendance = attRes.data || [];
      const attendedCount = attendance.filter((a) => a.attended).length;
      const rsvpYes = attendance.filter((a) => a.rsvp === "yes").length;
      const summary = {
        attendedCount,
        rsvpYes,
        invited: attendance.length,
        quorumRequired: meeting.quorum_required ?? null,
        quorumMet: meeting.quorum_required ? attendedCount >= meeting.quorum_required : null,
      };
      return NextResponse.json({ meeting, agenda: agendaRes.data || [], attendance, summary });
    }

    const { data, error } = await supabase
      .from("meetings")
      .select("*, agenda:meeting_agenda(count), attendance:meeting_attendance(count)")
      .order("scheduled_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    const meetings = (data || []).map((m) => ({
      ...m,
      agendaCount: m.agenda?.[0]?.count ?? 0,
      attendanceCount: m.attendance?.[0]?.count ?? 0,
    }));
    return NextResponse.json({ meetings });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/meetings", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load meetings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await gate();
    if (!g.ok) return g.res;
    const body = await req.json();
    if (!body.title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    const supabase = getServiceClient();
    const insert: Record<string, unknown> = { created_by: g.userId };
    for (const f of MEETING_FIELDS) if (body[f] !== undefined) insert[f] = body[f];
    const { data, error } = await supabase.from("meetings").insert(insert).select("id").single();
    if (error) throw new Error(error.message);
    logAudit(g.userId, "meeting_created", "meeting", data.id, { title: body.title });
    return NextResponse.json({ id: data.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/meetings", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create meeting" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const g = await gate();
    if (!g.ok) return g.res;
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "Meeting ID required" }, { status: 400 });
    const supabase = getServiceClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const f of MEETING_FIELDS) if (body[f] !== undefined) updates[f] = body[f];
    // Finalize/unfinalize minutes with stamp.
    if (body.minutes_finalized !== undefined) {
      updates.minutes_finalized = !!body.minutes_finalized;
      updates.minutes_finalized_at = body.minutes_finalized ? new Date().toISOString() : null;
      updates.minutes_finalized_by = body.minutes_finalized ? g.userId : null;
    }
    const { error } = await supabase.from("meetings").update(updates).eq("id", body.id);
    if (error) throw new Error(error.message);
    logAudit(g.userId, "meeting_updated", "meeting", body.id, {});
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/meetings", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update meeting" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const g = await gate();
    if (!g.ok) return g.res;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Meeting ID required" }, { status: 400 });
    const supabase = getServiceClient();
    const { error } = await supabase.from("meetings").delete().eq("id", id);
    if (error) throw new Error(error.message);
    logAudit(g.userId, "meeting_deleted", "meeting", id, {});
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/meetings", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete meeting" }, { status: 500 });
  }
}
