import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdminOrOfficial } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();

  const { data: polls } = await supabase
    .from("polls")
    .select("*, users!polls_created_by_fkey(name)")
    .order("created_at", { ascending: false });

  // Get vote counts per poll
  const { data: votes } = await supabase
    .from("poll_votes")
    .select("poll_id, option_index, user_id");

  // Get user's votes
  const myVotes: Record<string, number> = {};
  const voteCounts: Record<string, Record<number, number>> = {};
  const totalVotes: Record<string, number> = {};

  for (const v of votes || []) {
    if (v.user_id === session.userId) myVotes[v.poll_id] = v.option_index;
    if (!voteCounts[v.poll_id]) voteCounts[v.poll_id] = {};
    voteCounts[v.poll_id][v.option_index] = (voteCounts[v.poll_id][v.option_index] || 0) + 1;
    totalVotes[v.poll_id] = (totalVotes[v.poll_id] || 0) + 1;
  }

  return NextResponse.json({
    polls: (polls || []).map((p) => ({
      ...p,
      voteCounts: voteCounts[p.id] || {},
      totalVotes: totalVotes[p.id] || 0,
      myVote: myVotes[p.id] ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !(await isAdminOrOfficial(session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { title, options, expires_at } = await req.json();
  if (!title?.trim() || !options?.length || options.length < 2) {
    return NextResponse.json({ error: "Title and at least 2 options required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("polls")
    .insert({ title: title.trim(), options, created_by: session.userId, expires_at: expires_at || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to create poll" }, { status: 500 });
  return NextResponse.json({ poll: data });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { poll_id, option_index } = await req.json();
  if (!poll_id || option_index === undefined) {
    return NextResponse.json({ error: "poll_id and option_index required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Check poll is active
  const { data: poll } = await supabase.from("polls").select("status, expires_at").eq("id", poll_id).single();
  if (!poll || poll.status !== "active") return NextResponse.json({ error: "Poll is closed" }, { status: 400 });
  if (poll.expires_at && new Date(poll.expires_at) < new Date()) {
    return NextResponse.json({ error: "Poll has expired" }, { status: 400 });
  }

  await supabase
    .from("poll_votes")
    .upsert({ poll_id, user_id: session.userId, option_index }, { onConflict: "poll_id,user_id" });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !(await isAdminOrOfficial(session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const supabase = getServiceClient();
  await supabase.from("polls").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
