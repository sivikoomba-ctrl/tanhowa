import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();

    // Fetch all teams with their members
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("*")
      .order("sort_order", { ascending: true });

    if (teamsError) {
      await logError({ type: "api", message: teamsError.message, path: "/api/teams", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
    }

    // Fetch team members
    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("*")
      .order("created_at", { ascending: true });

    // Get unique user IDs from team members
    const userIds = [...new Set((teamMembers || []).map((tm) => tm.user_id))];

    // Fetch user details for all team members
    let usersMap: Record<string, Record<string, unknown>> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name, email, phone, photo_url, occupation, role, posting_details")
        .in("id", userIds);

      usersMap = (users || []).reduce((acc, u) => {
        acc[u.id] = u;
        return acc;
      }, {} as Record<string, Record<string, unknown>>);
    }

    // Group members by team
    const teamsWithMembers = (teams || []).map((team) => ({
      ...team,
      members: (teamMembers || [])
        .filter((tm) => tm.team_id === team.id)
        .map((tm) => ({ ...usersMap[tm.user_id], team_role: tm.role }))
        .filter((m) => "id" in m && m.id),
    }));

    return NextResponse.json({ teams: teamsWithMembers });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/teams", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    const name = (body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("teams")
      .insert({
        name,
        description: (body.description || "").trim(),
        icon: body.icon || "",
        sort_order: body.sort_order || 0,
        created_by: session.userId,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/teams", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
    }

    // Add members if provided
    if (body.member_ids && body.member_ids.length > 0) {
      const memberInserts = body.member_ids.map((userId: string) => ({
        team_id: data.id,
        user_id: userId,
        added_by: session.userId,
      }));

      await supabase.from("team_members").insert(memberInserts);
    }

    return NextResponse.json({ team: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/teams", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: "Team ID is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Update team details
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.icon !== undefined) updates.icon = body.icon;
    if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

    const { error } = await supabase
      .from("teams")
      .update(updates)
      .eq("id", body.id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/teams", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
    }

    // Update members if provided (replace all members)
    if (body.member_ids !== undefined) {
      // Remove existing members
      await supabase.from("team_members").delete().eq("team_id", body.id);

      // Add new members
      if (body.member_ids.length > 0) {
        const memberInserts = body.member_ids.map((userId: string) => ({
          team_id: body.id,
          user_id: userId,
          added_by: session.userId,
        }));

        await supabase.from("team_members").insert(memberInserts);
      }
    }

    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/teams", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
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
    await supabase.from("teams").delete().eq("id", id);

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/teams", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}
