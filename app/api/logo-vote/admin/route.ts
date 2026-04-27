import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isSuperAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logAudit } from "@/lib/audit-log";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isSuperAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = getServiceClient();

    // Per-concept tally + per-district + per-designation breakdown
    const { data: votes } = await supabase
      .from("logo_votes")
      .select("user_id, concept_id, voted_at");

    const userIds = Array.from(new Set((votes || []).map((v) => v.user_id)));
    let usersMap: Record<string, { name: string; occupation: string | null; posting_details: Record<string, string> | null; email: string }> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name, occupation, posting_details, email")
        .in("id", userIds);
      usersMap = Object.fromEntries(((users || []) as { id: string; name: string; occupation: string | null; posting_details: Record<string, string> | null; email: string }[]).map((u) => [u.id, { name: u.name, occupation: u.occupation, posting_details: u.posting_details, email: u.email }]));
    }

    interface Tally { concept_id: string; count: number; }
    interface Breakdown { [conceptId: string]: { [key: string]: number } }

    const tally: Tally[] = [];
    const tallyMap: Record<string, number> = {};
    const districtBreakdown: Breakdown = {};
    const designationBreakdown: Breakdown = {};

    const voterRows: { user_id: string; user_name: string; designation: string; district: string; concept_id: string; voted_at: string }[] = [];

    for (const v of votes || []) {
      tallyMap[v.concept_id] = (tallyMap[v.concept_id] || 0) + 1;
      const u = usersMap[v.user_id];
      const pd = (u?.posting_details || {}) as Record<string, string>;
      const district = pd.special_duty_district || pd.deputed_district || pd.regular_district || "Unknown";
      const designation = u?.occupation || "Unknown";

      if (!districtBreakdown[v.concept_id]) districtBreakdown[v.concept_id] = {};
      districtBreakdown[v.concept_id][district] = (districtBreakdown[v.concept_id][district] || 0) + 1;
      if (!designationBreakdown[v.concept_id]) designationBreakdown[v.concept_id] = {};
      designationBreakdown[v.concept_id][designation] = (designationBreakdown[v.concept_id][designation] || 0) + 1;

      voterRows.push({
        user_id: v.user_id,
        user_name: u?.name || "Unknown",
        designation,
        district,
        concept_id: v.concept_id,
        voted_at: v.voted_at,
      });
    }
    for (const [cid, count] of Object.entries(tallyMap)) tally.push({ concept_id: cid, count });

    return NextResponse.json({
      tally,
      districtBreakdown,
      designationBreakdown,
      voters: voterRows,
      totalVotes: (votes || []).length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/logo-vote/admin", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load admin data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isSuperAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const action = body?.action as string;

    const supabase = getServiceClient();

    if (action === "open") {
      // optional: { days?: number, ends_at?: string }
      const days = Number(body?.days || 0);
      const endsAt = body?.ends_at
        ? new Date(body.ends_at).toISOString()
        : days > 0
          ? new Date(Date.now() + days * 86400000).toISOString()
          : new Date(Date.now() + 7 * 86400000).toISOString();
      await supabase.from("site_settings").upsert([
        { key: "logo_vote_open", value: "true" },
        { key: "logo_vote_started_at", value: new Date().toISOString() },
        { key: "logo_vote_ends_at", value: endsAt },
        { key: "logo_vote_winner_concept_id", value: "" },
      ], { onConflict: "key" });
      logAudit(session.userId, "logo_vote.open", "logo_vote", undefined, { ends_at: endsAt });
      return NextResponse.json({ ok: true, ends_at: endsAt });
    }

    if (action === "extend") {
      const days = Number(body?.days || 0);
      if (days <= 0) return NextResponse.json({ error: "days required" }, { status: 400 });
      const { data: cur } = await supabase.from("site_settings").select("value").eq("key", "logo_vote_ends_at").maybeSingle();
      const base = cur?.value ? new Date(cur.value).getTime() : Date.now();
      const newEnds = new Date(base + days * 86400000).toISOString();
      await supabase.from("site_settings").upsert({ key: "logo_vote_ends_at", value: newEnds }, { onConflict: "key" });
      logAudit(session.userId, "logo_vote.extend", "logo_vote", undefined, { new_ends_at: newEnds, days });
      return NextResponse.json({ ok: true, ends_at: newEnds });
    }

    if (action === "close") {
      await supabase.from("site_settings").upsert({ key: "logo_vote_open", value: "false" }, { onConflict: "key" });
      logAudit(session.userId, "logo_vote.close", "logo_vote", undefined, {});
      return NextResponse.json({ ok: true });
    }

    if (action === "announce") {
      // body: { concept_id }
      const conceptId = body?.concept_id as string;
      if (!conceptId) return NextResponse.json({ error: "concept_id required" }, { status: 400 });
      const { data: concept } = await supabase.from("logo_concepts").select("id, name, blurb, image_url").eq("id", conceptId).maybeSingle();
      if (!concept) return NextResponse.json({ error: "Concept not found" }, { status: 404 });

      // Save winner & lock voting
      await supabase.from("site_settings").upsert([
        { key: "logo_vote_winner_concept_id", value: concept.id },
        { key: "logo_vote_open", value: "false" },
      ], { onConflict: "key" });

      // Auto-create announcement
      const { data: adminUser } = await supabase.from("users").select("id").eq("email", "tanhowaadmin@tanhowa.in").maybeSingle();
      const adminId = adminUser?.id || session.userId;
      await supabase.from("announcements").insert({
        title: `New TANHOWA logo selected: ${concept.name}`,
        content: `The members have spoken! After a week of voting and feedback, the winning design is "${concept.name}".\n\n${concept.blurb || ""}\n\nThank you to every member who took the time to vote and share their thoughts. The new logo will be rolled out across the portal, stationery, and all communications shortly.\n\n— TANHOWA Family`,
        author_id: adminId,
        published: true,
      });

      logAudit(session.userId, "logo_vote.announce", "logo_concept", concept.id, { name: concept.name });
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_comment") {
      const id = body?.id as string;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      await supabase.from("logo_comments").delete().eq("id", id);
      logAudit(session.userId, "logo_vote.comment_delete", "logo_comment", id, {});
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/logo-vote/admin", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
