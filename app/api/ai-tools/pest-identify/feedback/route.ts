import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";

const ALLOWED = new Set(["helpful", "incorrect", "unsure"]);

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null) as { id?: string; user_feedback?: string; note?: string } | null;
    if (!body?.id || !body.user_feedback) {
      return NextResponse.json({ error: "Missing id or user_feedback" }, { status: 400 });
    }
    if (!ALLOWED.has(body.user_feedback)) {
      return NextResponse.json({ error: "Invalid feedback value" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data: row, error: fetchErr } = await supabase
      .from("pest_identifications")
      .select("id, user_id")
      .eq("id", body.id)
      .maybeSingle();

    if (fetchErr || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (row.user_id !== session.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error: updErr } = await supabase
      .from("pest_identifications")
      .update({
        user_feedback: body.user_feedback,
        user_feedback_note: (body.note || "").slice(0, 500),
      })
      .eq("id", body.id);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/ai-tools/pest-identify/feedback", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }
}
