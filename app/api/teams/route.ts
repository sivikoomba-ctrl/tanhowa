import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isAdminOrOfficial } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { sendTeamWelcomeEmail } from "@/lib/mail";

type AddedMember = { user_id: string; role?: string };

// Email a welcome note to each newly-added team member (throttled, transactional).
async function welcomeAddedTeamMembers(
  supabase: ReturnType<typeof getServiceClient>,
  teamName: string,
  members: AddedMember[],
) {
  try {
    const ids = [...new Set(members.map((m) => m.user_id))];
    if (ids.length === 0) return;
    const { data: users } = await supabase.from("users").select("id, name, email").in("id", ids);
    const byId = new Map((users || []).map((u: { id: string; name?: string; email?: string }) => [u.id, u]));
    for (const m of members) {
      const u = byId.get(m.user_id);
      if (!u?.email) continue;
      await sendTeamWelcomeEmail(u.email, u.name || "Member", teamName, m.role === "lead").catch(() => {});
      await new Promise((r) => setTimeout(r, 250)); // throttle to avoid Gmail domain rate-limit
    }
  } catch {
    /* non-fatal */
  }
}

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

    // Privacy filter: private teams visible only to admins/officials and the team's own members
    const canSeeAllPrivate = await isAdminOrOfficial(session);
    const visibleTeams = canSeeAllPrivate
      ? teamsWithMembers
      : teamsWithMembers.filter(
          (t) => !t.is_private || t.members.some((m: { id?: string }) => m.id === session.userId)
        );

    return NextResponse.json({ teams: visibleTeams });
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
        is_private: !!body.is_private,
        whatsapp_link: (body.whatsapp_link || "").trim() || null,
        created_by: session.userId,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/teams", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
    }

    // Add members if provided (with optional roles)
    let addedMembers: AddedMember[] = [];
    if (body.members_with_roles && body.members_with_roles.length > 0) {
      addedMembers = body.members_with_roles.map((m: { user_id: string; role?: string }) => ({ user_id: m.user_id, role: m.role || "member" }));
      await supabase.from("team_members").insert(addedMembers.map((m) => ({ team_id: data.id, user_id: m.user_id, role: m.role, added_by: session.userId })));
    } else if (body.member_ids && body.member_ids.length > 0) {
      addedMembers = body.member_ids.map((userId: string) => ({ user_id: userId }));
      await supabase.from("team_members").insert(addedMembers.map((m) => ({ team_id: data.id, user_id: m.user_id, added_by: session.userId })));
    }

    // Welcome every member added to the new team
    if (addedMembers.length > 0) await welcomeAddedTeamMembers(supabase, data.name, addedMembers);

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
    if (body.is_private !== undefined) updates.is_private = !!body.is_private;
    if (body.whatsapp_link !== undefined) updates.whatsapp_link = (body.whatsapp_link || "").trim() || null;

    const { error } = await supabase
      .from("teams")
      .update(updates)
      .eq("id", body.id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/teams", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
    }

    // Update members if provided (replace all members with roles)
    if (body.member_ids !== undefined || body.members_with_roles !== undefined) {
      // Capture existing members first so we only welcome the newly-added ones
      const { data: existing } = await supabase.from("team_members").select("user_id").eq("team_id", body.id);
      const existingIds = new Set((existing || []).map((tm: { user_id: string }) => tm.user_id));

      // Remove existing members
      await supabase.from("team_members").delete().eq("team_id", body.id);

      // Add new members with roles
      let newList: AddedMember[] = [];
      if (body.members_with_roles && body.members_with_roles.length > 0) {
        newList = body.members_with_roles.map((m: { user_id: string; role?: string }) => ({ user_id: m.user_id, role: m.role || "member" }));
        await supabase.from("team_members").insert(newList.map((m) => ({ team_id: body.id, user_id: m.user_id, role: m.role, added_by: session.userId })));
      } else if (body.member_ids && body.member_ids.length > 0) {
        newList = body.member_ids.map((userId: string) => ({ user_id: userId }));
        await supabase.from("team_members").insert(newList.map((m) => ({ team_id: body.id, user_id: m.user_id, added_by: session.userId })));
      }

      // Welcome only members who were not already on the team
      const justAdded = newList.filter((m) => !existingIds.has(m.user_id));
      if (justAdded.length > 0) {
        let teamName = typeof body.name === "string" ? body.name.trim() : "";
        if (!teamName) {
          const { data: t } = await supabase.from("teams").select("name").eq("id", body.id).single();
          teamName = t?.name || "your team";
        }
        await welcomeAddedTeamMembers(supabase, teamName, justAdded);
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
