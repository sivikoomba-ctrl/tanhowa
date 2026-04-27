import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

interface PostingDetails {
  regular_district?: string;
  special_duty_district?: string;
  deputed_district?: string;
}

interface CommentRow {
  id: string;
  user_id: string;
  concept_id: string | null;
  comment: string;
  created_at: string;
  updated_at: string;
}

interface UserRow {
  id: string;
  name: string;
  occupation: string | null;
  posting_details: PostingDetails | null;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();

    const [conceptsRes, votesRes, myVoteRes, commentsRes, settingsRes, myCommentRes] = await Promise.all([
      supabase.from("logo_concepts").select("*").eq("active", true).order("sort_order", { ascending: true }),
      supabase.from("logo_votes").select("concept_id"),
      supabase.from("logo_votes").select("concept_id").eq("user_id", session.userId).maybeSingle(),
      supabase.from("logo_comments").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("site_settings").select("key, value").in("key", ["logo_vote_open", "logo_vote_started_at", "logo_vote_ends_at", "logo_vote_winner_concept_id"]),
      supabase.from("logo_comments").select("*").eq("user_id", session.userId).maybeSingle(),
    ]);

    const concepts = conceptsRes.data || [];
    const votes = (votesRes.data || []) as { concept_id: string }[];
    const comments = (commentsRes.data || []) as CommentRow[];

    // Tally
    const tally: Record<string, number> = {};
    for (const v of votes) tally[v.concept_id] = (tally[v.concept_id] || 0) + 1;
    const totalVotes = votes.length;

    // Enrich comments with member info
    const userIds = Array.from(new Set(comments.map((c) => c.user_id)));
    let userMap: Record<string, UserRow> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name, occupation, posting_details")
        .in("id", userIds);
      userMap = Object.fromEntries(((users || []) as UserRow[]).map((u) => [u.id, u]));
    }

    const enrichedComments = comments.map((c) => {
      const u = userMap[c.user_id];
      const pd = u?.posting_details || {};
      const district = pd.special_duty_district || pd.deputed_district || pd.regular_district || "";
      return {
        id: c.id,
        concept_id: c.concept_id,
        comment: c.comment,
        created_at: c.created_at,
        updated_at: c.updated_at,
        is_mine: c.user_id === session.userId,
        author_name: u?.name || "Member",
        author_designation: u?.occupation || "",
        author_district: district,
      };
    });

    // Settings → simple object
    const settings: Record<string, string> = {};
    for (const s of settingsRes.data || []) settings[s.key] = s.value;

    const open = (settings.logo_vote_open || "false") === "true";
    const startedAt = settings.logo_vote_started_at || null;
    const endsAt = settings.logo_vote_ends_at || null;
    const winnerConceptId = settings.logo_vote_winner_concept_id || null;
    const closedByTime = endsAt ? new Date(endsAt).getTime() < Date.now() : false;
    const isOpen = open && !closedByTime && !winnerConceptId;

    return NextResponse.json({
      concepts: concepts.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        blurb: c.blurb,
        image_url: c.image_url,
        votes: tally[c.id] || 0,
      })),
      totalVotes,
      myVote: myVoteRes.data?.concept_id || null,
      myComment: myCommentRes.data
        ? {
            id: myCommentRes.data.id,
            concept_id: myCommentRes.data.concept_id,
            comment: myCommentRes.data.comment,
          }
        : null,
      comments: enrichedComments,
      isOpen,
      startedAt,
      endsAt,
      winnerConceptId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/logo-vote", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load logo vote" }, { status: 500 });
  }
}
