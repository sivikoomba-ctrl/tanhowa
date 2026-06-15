import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";
import { governanceGate as gate } from "@/lib/governance-auth";

const FIELDS = ["title", "description", "presenter", "status", "order_index", "linked_resolution_id"] as const;

export async function POST(req: NextRequest) {
  try {
    const g = await gate();
    if (!g.ok) return g.res;
    const body = await req.json();
    if (!body.meetingId || !body.title?.trim()) {
      return NextResponse.json({ error: "Meeting ID and title required" }, { status: 400 });
    }
    const supabase = getServiceClient();
    // Append to the end if no explicit order.
    let order = body.order_index;
    if (order === undefined) {
      const { data: last } = await supabase
        .from("meeting_agenda")
        .select("order_index")
        .eq("meeting_id", body.meetingId)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      order = (last?.order_index ?? -1) + 1;
    }
    const insert: Record<string, unknown> = { meeting_id: body.meetingId, title: body.title, order_index: order };
    for (const f of FIELDS) if (f !== "order_index" && body[f] !== undefined) insert[f] = body[f];
    const { data, error } = await supabase.from("meeting_agenda").insert(insert).select("id").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/meetings/agenda", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to add agenda item" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const g = await gate();
    if (!g.ok) return g.res;
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "Agenda item ID required" }, { status: 400 });
    const supabase = getServiceClient();
    const updates: Record<string, unknown> = {};
    for (const f of FIELDS) if (body[f] !== undefined) updates[f] = body[f];
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No fields" }, { status: 400 });
    const { error } = await supabase.from("meeting_agenda").update(updates).eq("id", body.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/meetings/agenda", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update agenda item" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const g = await gate();
    if (!g.ok) return g.res;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Agenda item ID required" }, { status: 400 });
    const supabase = getServiceClient();
    const { error } = await supabase.from("meeting_agenda").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/meetings/agenda", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete agenda item" }, { status: 500 });
  }
}
