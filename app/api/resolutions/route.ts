import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, getDbRole, getOfficialType } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status");
    const my = url.searchParams.get("my");

    const role = await getDbRole(session.userId);
    const officialType = await getOfficialType(session.userId);
    const canSeeAll = role === "admin" || role === "super_admin" || officialType === "state" || officialType === "district";

    let query = supabase
      .from("resolutions")
      .select("*, submitter:users!resolutions_submitted_by_fkey(name), approver:users!resolutions_approved_by_fkey(name)")
      .order("created_at", { ascending: false });

    if (my === "true") {
      query = query.eq("submitted_by", session.userId);
    } else if (!canSeeAll) {
      // Members only see voting_open, passed, failed
      query = query.in("status", ["voting_open", "passed", "failed"]);
    }

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data: resolutions } = await query;

    // Get vote counts for all resolutions
    const resIds = (resolutions || []).map((r: { id: string }) => r.id);
    const voteCounts: Record<string, number> = {};
    const userVotes: Set<string> = new Set();

    if (resIds.length > 0) {
      // Get counts per resolution
      const { data: votes } = await supabase
        .from("resolution_votes")
        .select("resolution_id")
        .in("resolution_id", resIds);

      for (const v of votes || []) {
        voteCounts[v.resolution_id] = (voteCounts[v.resolution_id] || 0) + 1;
      }

      // Check which ones the current user voted on
      const { data: myVotes } = await supabase
        .from("resolution_votes")
        .select("resolution_id")
        .eq("user_id", session.userId)
        .in("resolution_id", resIds);

      for (const v of myVotes || []) {
        userVotes.add(v.resolution_id);
      }
    }

    const enriched = (resolutions || []).map((r: { id: string }) => ({
      ...r,
      vote_count: voteCounts[r.id] || 0,
      user_voted: userVotes.has(r.id),
    }));

    return NextResponse.json({ resolutions: enriched });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/resolutions", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch resolutions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Only super_admin and state officials can create resolutions
    const role = await getDbRole(session.userId);
    const official = await getOfficialType(session.userId);
    if (role !== "super_admin" && official !== "state") {
      return NextResponse.json({ error: "Only Super Admin and State Officials can create resolutions" }, { status: 403 });
    }

    const body = await req.json();
    if (!body.title?.trim() || !body.description?.trim()) {
      return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Get current approved member count for votes_required
    const { count: memberCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved")
      .neq("email", "tanhowa19791@gmail.com");

    const totalMembers = memberCount || 798;
    const votesRequired = Math.floor(totalMembers / 2) + 1;

    const { data, error } = await supabase
      .from("resolutions")
      .insert({
        title: body.title.trim(),
        description: body.description.trim(),
        category: body.category?.trim() || "",
        status: "draft",
        submitted_by: session.userId,
        total_members: totalMembers,
        votes_required: votesRequired,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/resolutions", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create resolution" }, { status: 500 });
    }

    return NextResponse.json({ resolution: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/resolutions", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create resolution" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { resolutionId, action } = body;

    if (!resolutionId) {
      return NextResponse.json({ error: "Resolution ID required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Fetch current resolution
    const { data: resolution } = await supabase
      .from("resolutions")
      .select("*")
      .eq("id", resolutionId)
      .single();

    if (!resolution) {
      return NextResponse.json({ error: "Resolution not found" }, { status: 404 });
    }

    if (action === "edit") {
      // Only author can edit drafts
      if (resolution.submitted_by !== session.userId) {
        return NextResponse.json({ error: "Only the author can edit" }, { status: 403 });
      }
      if (resolution.status !== "draft") {
        return NextResponse.json({ error: "Can only edit drafts" }, { status: 400 });
      }
      await supabase.from("resolutions").update({
        title: body.title?.trim() || resolution.title,
        description: body.description?.trim() || resolution.description,
        category: body.category?.trim() ?? resolution.category,
        updated_at: new Date().toISOString(),
      }).eq("id", resolutionId);

    } else if (action === "submit") {
      // Author submits draft for approval
      if (resolution.submitted_by !== session.userId && !(await isAdmin(session))) {
        return NextResponse.json({ error: "Only the author can submit" }, { status: 403 });
      }
      if (resolution.status !== "draft") {
        return NextResponse.json({ error: "Can only submit drafts" }, { status: 400 });
      }
      await supabase.from("resolutions").update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", resolutionId);

    } else if (action === "approve") {
      if (!(await isAdmin(session))) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }
      if (resolution.status !== "submitted") {
        return NextResponse.json({ error: "Can only approve submitted resolutions" }, { status: 400 });
      }
      await supabase.from("resolutions").update({
        status: "approved",
        approved_by: session.userId,
        approved_at: new Date().toISOString(),
        admin_remarks: body.remarks || "",
        updated_at: new Date().toISOString(),
      }).eq("id", resolutionId);

    } else if (action === "reject") {
      if (!(await isAdmin(session))) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }
      if (resolution.status !== "submitted") {
        return NextResponse.json({ error: "Can only reject submitted resolutions" }, { status: 400 });
      }
      await supabase.from("resolutions").update({
        status: "rejected",
        admin_remarks: body.remarks || "",
        updated_at: new Date().toISOString(),
      }).eq("id", resolutionId);

    } else if (action === "open_voting") {
      if (!(await isAdmin(session))) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }
      if (resolution.status !== "approved") {
        return NextResponse.json({ error: "Can only open voting on approved resolutions" }, { status: 400 });
      }
      // Recalculate member count at voting time
      const { count: memberCount } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("status", "approved");

      const totalMembers = memberCount || 798;
      const votesRequired = Math.floor(totalMembers / 2) + 1;

      await supabase.from("resolutions").update({
        status: "voting_open",
        voting_opened_at: new Date().toISOString(),
        total_members: totalMembers,
        votes_required: votesRequired,
        updated_at: new Date().toISOString(),
      }).eq("id", resolutionId);

    } else if (action === "close_voting") {
      if (!(await isAdmin(session))) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }
      if (resolution.status !== "voting_open") {
        return NextResponse.json({ error: "Voting is not open" }, { status: 400 });
      }
      // Count votes
      const { count: voteCount } = await supabase
        .from("resolution_votes")
        .select("*", { count: "exact", head: true })
        .eq("resolution_id", resolutionId);

      const finalStatus = (voteCount || 0) >= resolution.votes_required ? "passed" : "failed";

      await supabase.from("resolutions").update({
        status: finalStatus,
        voting_closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", resolutionId);

      return NextResponse.json({ message: "Voting closed", status: finalStatus, votes: voteCount });

    } else if (action === "vote") {
      if (resolution.status !== "voting_open") {
        return NextResponse.json({ error: "Voting is not open for this resolution" }, { status: 400 });
      }
      const { error: voteError } = await supabase
        .from("resolution_votes")
        .insert({ resolution_id: resolutionId, user_id: session.userId });

      if (voteError) {
        if (voteError.code === "23505") {
          return NextResponse.json({ error: "Already voted" }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to vote" }, { status: 500 });
      }

    } else if (action === "unvote") {
      if (resolution.status !== "voting_open") {
        return NextResponse.json({ error: "Voting is not open" }, { status: 400 });
      }
      await supabase.from("resolution_votes")
        .delete()
        .eq("resolution_id", resolutionId)
        .eq("user_id", session.userId);

    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ message: "Resolution updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/resolutions", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update resolution" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();

    // Don't allow deleting resolutions that have been voted on
    const { data: resolution } = await supabase.from("resolutions").select("status").eq("id", id).single();
    if (resolution && (resolution.status === "voting_open" || resolution.status === "passed" || resolution.status === "failed")) {
      return NextResponse.json({ error: "Cannot delete resolutions that have entered voting" }, { status: 400 });
    }

    await supabase.from("resolutions").delete().eq("id", id);
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/resolutions", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
