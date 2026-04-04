import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdminOrOfficial } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logAudit } from "@/lib/audit-log";
import { translateContent, getTranslations } from "@/lib/translate-content";

export async function GET(req: NextRequest) {
  try {
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

    const enriched = (polls || []).map((p) => ({
      ...p,
      voteCounts: voteCounts[p.id] || {},
      totalVotes: totalVotes[p.id] || 0,
      myVote: myVotes[p.id] ?? null,
    }));

    const url = new URL(req.url);
    const lang = url.searchParams.get("lang");
    if (lang === "ta" && enriched.length > 0) {
      const ids = enriched.map((p: { id: string }) => p.id);
      const translations = await getTranslations("polls", ids, "ta");
      for (const p of enriched) {
        const t = translations[p.id];
        if (t) {
          if (t.title) p.title = t.title;
          if (t.options) {
            try { p.options = JSON.parse(t.options); } catch { /* keep original */ }
          }
        }
      }
    }

    return NextResponse.json({ polls: enriched });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/polls", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch polls" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
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
    logAudit(session.userId, "poll_created", "poll", data.id);
    translateContent("polls", data.id, { title: data.title, options: JSON.stringify(data.options) });
    return NextResponse.json({ poll: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/polls", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create poll" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    // Admin action: close or reopen a poll
    if (body.action === "close" || body.action === "reopen") {
      if (!(await isAdminOrOfficial(session))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const supabase = getServiceClient();
      const newStatus = body.action === "close" ? "closed" : "active";
      await supabase.from("polls").update({ status: newStatus }).eq("id", body.id);
      logAudit(session.userId, "poll_" + body.action, "poll", body.id);
      return NextResponse.json({ ok: true });
    }

    // Member action: cast a vote
    const { poll_id, option_index } = body;
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
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/polls", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to submit vote" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdminOrOfficial(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    await supabase.from("polls").delete().eq("id", id);
    logAudit(session.userId, "poll_deleted", "poll", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/polls", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete poll" }, { status: 500 });
  }
}
