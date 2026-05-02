/**
 * Marks the re-engagement modal as shown for the current user without
 * recording an actual response. Used when the user dismisses the modal
 * without answering — we won't show it again.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";

export async function POST() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    await supabase
      .from("feedback_prompts_shown")
      .upsert(
        { user_id: session.userId, kind: "re_engagement", responded: false, shown_at: new Date().toISOString() },
        { onConflict: "user_id,kind" },
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/feedback/dismiss", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
