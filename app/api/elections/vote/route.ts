import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

const TEST_EMAILS = ["tanhowa19791@gmail.com", "tanhowaadmin@tanhowa.in"];

interface MemberRow {
  name: string | null;
  status: string | null;
  posting_details: { regular_district?: string } | null;
}

async function getMember(userId: string): Promise<MemberRow | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("users")
    .select("name, status, posting_details")
    .eq("id", userId)
    .single();
  return (data as MemberRow) || null;
}

const districtOf = (m: MemberRow): string | null => m.posting_details?.regular_district || null;

// GET — live polling dashboard: votable/closed posts, approved candidates with tallies,
// the caller's own vote, eligibility, and turnout (eligible voter counts). Secret ballot:
// no voter identities are returned.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const member = await getMember(session.userId);
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    if (member.status !== "approved") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = getServiceClient();
    const myDistrict = districtOf(member);

    const { data: posts, error } = await supabase
      .from("election_posts")
      .select("id, title, description, district, status, candidates:election_candidates(id, name, district, statement, status)")
      .in("status", ["voting_open", "closed"])
      .order("display_order", { ascending: true });
    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/elections/vote", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to load" }, { status: 500 });
    }

    const postList = posts || [];
    const postIds = postList.map((p) => p.id);

    // Votes for these posts (voter_id used only to find the caller's own vote)
    let votes: { post_id: string; candidate_id: string; voter_id: string }[] = [];
    if (postIds.length) {
      const { data: v } = await supabase
        .from("election_votes")
        .select("post_id, candidate_id, voter_id")
        .in("post_id", postIds);
      votes = v || [];
    }

    // Eligible-voter counts for turnout: approved members overall + per district
    const { data: approved } = await supabase
      .from("users")
      .select("posting_details, email")
      .eq("status", "approved");
    let approvedTotal = 0;
    const districtCounts: Record<string, number> = {};
    const approvedRows = (approved || []) as { posting_details: { regular_district?: string } | null; email: string | null }[];
    for (const u of approvedRows) {
      if (TEST_EMAILS.includes(u.email || "")) continue;
      approvedTotal++;
      const d = u.posting_details?.regular_district;
      if (d) districtCounts[d] = (districtCounts[d] || 0) + 1;
    }

    const result = postList.map((p) => {
      const approvedCandidates = (p.candidates || []).filter((c) => c.status === "approved");
      const postVotes = votes.filter((v) => v.post_id === p.id);
      const myVote = postVotes.find((v) => v.voter_id === session.userId)?.candidate_id || null;
      const totalVotes = postVotes.length;
      const candidates = approvedCandidates
        .map((c) => ({
          id: c.id,
          name: c.name,
          district: c.district,
          statement: c.statement,
          votes: postVotes.filter((v) => v.candidate_id === c.id).length,
        }))
        .sort((a, b) => b.votes - a.votes);
      const eligibleVoters = p.district ? (districtCounts[p.district] || 0) : approvedTotal;
      const eligible = !p.district || p.district === myDistrict;
      return {
        id: p.id,
        title: p.title,
        description: p.description,
        district: p.district,
        status: p.status,
        eligible,
        myVote,
        totalVotes,
        eligibleVoters,
        candidates,
      };
    });

    return NextResponse.json({ posts: result, memberDistrict: myDistrict });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/elections/vote", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load polling dashboard" }, { status: 500 });
  }
}

// POST — cast or change the caller's vote on a voting-open post
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const member = await getMember(session.userId);
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    if (member.status !== "approved") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = getServiceClient();
    const { post_id, candidate_id } = await req.json();
    if (!post_id || !candidate_id) return NextResponse.json({ error: "post_id and candidate_id are required" }, { status: 400 });

    const { data: post } = await supabase
      .from("election_posts")
      .select("id, district, status")
      .eq("id", post_id)
      .single();
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    if (post.status !== "voting_open") return NextResponse.json({ error: "Voting is not open for this post" }, { status: 400 });

    if (post.district && post.district !== districtOf(member)) {
      return NextResponse.json({ error: "You can only vote in your own district's post" }, { status: 403 });
    }

    // Candidate must belong to this post and be approved
    const { data: cand } = await supabase
      .from("election_candidates")
      .select("id, post_id, status")
      .eq("id", candidate_id)
      .single();
    if (!cand || cand.post_id !== post_id) return NextResponse.json({ error: "Invalid candidate" }, { status: 400 });
    if (cand.status !== "approved") return NextResponse.json({ error: "Candidate is not on the ballot" }, { status: 400 });

    const { error } = await supabase
      .from("election_votes")
      .upsert(
        { post_id, candidate_id, voter_id: session.userId, updated_at: new Date().toISOString() },
        { onConflict: "post_id,voter_id" },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/elections/vote", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to cast vote" }, { status: 500 });
  }
}

// DELETE — retract the caller's vote while voting is open (?post_id=<id>)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    const post_id = new URL(req.url).searchParams.get("post_id");
    if (!post_id) return NextResponse.json({ error: "post_id is required" }, { status: 400 });

    const { data: post } = await supabase.from("election_posts").select("status").eq("id", post_id).single();
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    if (post.status !== "voting_open") return NextResponse.json({ error: "Voting is closed for this post" }, { status: 400 });

    const { error } = await supabase
      .from("election_votes")
      .delete()
      .eq("post_id", post_id)
      .eq("voter_id", session.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/elections/vote", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to retract vote" }, { status: 500 });
  }
}
