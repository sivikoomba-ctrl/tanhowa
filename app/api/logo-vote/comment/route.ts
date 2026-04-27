import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";

async function isVotingOpen(supabase: ReturnType<typeof getServiceClient>): Promise<boolean> {
  const { data } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", ["logo_vote_open", "logo_vote_ends_at", "logo_vote_winner_concept_id"]);
  const map: Record<string, string> = {};
  for (const s of data || []) map[s.key] = s.value;
  if ((map.logo_vote_open || "false") !== "true") return false;
  if (map.logo_vote_winner_concept_id) return false;
  if (map.logo_vote_ends_at && new Date(map.logo_vote_ends_at).getTime() < Date.now()) return false;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const comment = (body?.comment || "").toString().trim();
    const conceptId = (body?.concept_id || null) as string | null;

    if (comment.length < 2) return NextResponse.json({ error: "Comment is too short" }, { status: 400 });
    if (comment.length > 800) return NextResponse.json({ error: "Comment too long (max 800 chars)" }, { status: 400 });

    const supabase = getServiceClient();
    if (!(await isVotingOpen(supabase))) {
      return NextResponse.json({ error: "Voting is closed" }, { status: 400 });
    }

    if (conceptId) {
      const { data: c } = await supabase.from("logo_concepts").select("id").eq("id", conceptId).maybeSingle();
      if (!c) return NextResponse.json({ error: "Concept not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("logo_comments")
      .upsert(
        {
          user_id: session.userId,
          concept_id: conceptId,
          comment,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;

    logContribution(session.userId, "logo_feedback", `Submitted feedback on logo selection`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/logo-vote/comment", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to save comment" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    await supabase.from("logo_comments").delete().eq("user_id", session.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/logo-vote/comment", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
