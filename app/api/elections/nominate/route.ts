import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

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

function memberDistrict(m: MemberRow): string | null {
  return m.posting_details?.regular_district || null;
}

// GET — posts open for nomination that this member is eligible for + their own nominations
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const member = await getMember(session.userId);
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    if (member.status !== "approved") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = getServiceClient();
    const district = memberDistrict(member);

    const { data: openPosts, error } = await supabase
      .from("election_posts")
      .select("id, title, description, district, status")
      .eq("status", "nominations_open")
      .order("display_order", { ascending: true });

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/elections/nominate", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to load posts" }, { status: 500 });
    }

    // Eligibility: state posts (district NULL) open to all; district posts only for own district
    const eligible = (openPosts || []).filter((p) => !p.district || p.district === district);

    const { data: nominations } = await supabase
      .from("election_candidates")
      .select("id, post_id, status, statement")
      .eq("user_id", session.userId);

    return NextResponse.json({
      posts: eligible,
      nominations: nominations || [],
      memberName: member.name || "",
      memberDistrict: district,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/elections/nominate", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load nominations" }, { status: 500 });
  }
}

// POST — submit a self-nomination for an open post
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const member = await getMember(session.userId);
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    if (member.status !== "approved") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!member.name?.trim()) {
      return NextResponse.json({ error: "Complete your profile name before nominating" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const body = await req.json();
    const { post_id, statement } = body;
    if (!post_id) return NextResponse.json({ error: "post_id is required" }, { status: 400 });

    const { data: post } = await supabase
      .from("election_posts")
      .select("id, title, district, status")
      .eq("id", post_id)
      .single();
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    if (post.status !== "nominations_open") {
      return NextResponse.json({ error: "Nominations are not open for this post" }, { status: 400 });
    }

    const district = memberDistrict(member);
    if (post.district && post.district !== district) {
      return NextResponse.json({ error: "You can only nominate for your own district's post" }, { status: 403 });
    }

    // One active nomination per member per post
    const { data: existing } = await supabase
      .from("election_candidates")
      .select("id, status")
      .eq("post_id", post_id)
      .eq("user_id", session.userId)
      .neq("status", "withdrawn")
      .maybeSingle();
    if (existing) return NextResponse.json({ error: "You have already nominated for this post" }, { status: 409 });

    const { data, error } = await supabase
      .from("election_candidates")
      .insert({
        post_id,
        user_id: session.userId,
        name: member.name!.trim(),
        district: post.district || district || null,
        statement: statement?.trim() || null,
        status: "nominated",
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ candidate: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/elections/nominate", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to submit nomination" }, { status: 500 });
  }
}

// DELETE — withdraw the member's own pending nomination (?id=<candidate_id>)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    // Only the owner can withdraw, and only while still 'nominated'
    const { data: cand } = await supabase
      .from("election_candidates")
      .select("id, user_id, status")
      .eq("id", id)
      .single();
    if (!cand) return NextResponse.json({ error: "Nomination not found" }, { status: 404 });
    if (cand.user_id !== session.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (cand.status !== "nominated") {
      return NextResponse.json({ error: "Only pending nominations can be withdrawn" }, { status: 400 });
    }

    const { error } = await supabase.from("election_candidates").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/elections/nominate", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to withdraw nomination" }, { status: 500 });
  }
}
