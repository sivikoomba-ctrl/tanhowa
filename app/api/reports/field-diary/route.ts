import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { todayIST } from "@/lib/field-diary";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30"), 1), 365);

    const today = todayIST();
    const fromDate = new Date(new Date(today + "T00:00:00Z").getTime() - (days - 1) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const supabase = getServiceClient();

    const [usersRes, entriesRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, posting_details")
        .eq("status", "approved")
        .neq("email", "tanhowa19791@gmail.com")
        .neq("email", "tanhowaadmin@tanhowa.in"),
      supabase
        .from("field_diary_entries")
        .select("id, member_id, district, entry_date, is_success_story, story_status, report_text, created_at")
        .gte("entry_date", fromDate)
        .lte("entry_date", today)
        .order("created_at", { ascending: false }),
    ]);

    const users = usersRes.data || [];
    const entries = entriesRes.data || [];

    function getDistrict(pd: Record<string, string> | null): string {
      return pd?.regular_district || pd?.special_duty_district || pd?.deputed_district || "Unknown";
    }

    const districtMap = new Map<string, { members: number; actualEntries: number; successStoriesFlagged: number; successStoriesPublished: number }>();
    for (const u of users) {
      const district = getDistrict(u.posting_details as Record<string, string> | null);
      if (!districtMap.has(district)) {
        districtMap.set(district, { members: 0, actualEntries: 0, successStoriesFlagged: 0, successStoriesPublished: 0 });
      }
      districtMap.get(district)!.members++;
    }

    for (const e of entries) {
      const district = e.district || "Unknown";
      const d = districtMap.get(district);
      if (!d) continue; // entry from a member outside the approved set snapshot (e.g. test account) — skip
      d.actualEntries++;
      if (e.is_success_story) d.successStoriesFlagged++;
      if (e.story_status === "published") d.successStoriesPublished++;
    }

    const districts = Array.from(districtMap.entries())
      .filter(([name]) => name !== "Unknown")
      .map(([name, d]) => {
        // Approximation: members × calendar days in range (not working-days-only,
        // since TANHOWA field officers' schedules vary too much to assume a fixed week).
        const expectedEntries = d.members * days;
        return {
          name,
          members: d.members,
          expectedEntries,
          actualEntries: d.actualEntries,
          complianceRate: expectedEntries > 0 ? Math.round((d.actualEntries / expectedEntries) * 100) : 0,
          successStoriesFlagged: d.successStoriesFlagged,
          successStoriesPublished: d.successStoriesPublished,
        };
      })
      .sort((a, b) => b.complianceRate - a.complianceRate);

    const totalMembers = users.length;
    const totalExpected = totalMembers * days;
    const totalActual = entries.length;
    const totalSuccessFlagged = entries.filter((e) => e.is_success_story).length;
    const totalSuccessPublished = entries.filter((e) => e.story_status === "published").length;

    const recentHighlights = entries.slice(0, 8).map((e) => ({
      id: e.id,
      district: e.district,
      entry_date: e.entry_date,
      snippet: e.report_text.length > 160 ? e.report_text.slice(0, 160) + "…" : e.report_text,
      is_success_story: e.is_success_story,
      story_status: e.story_status,
    }));

    return NextResponse.json({
      from: fromDate,
      to: today,
      days,
      totalMembers,
      totalExpected,
      totalActual,
      complianceRate: totalExpected > 0 ? Math.round((totalActual / totalExpected) * 100) : 0,
      totalSuccessFlagged,
      totalSuccessPublished,
      districts,
      recentHighlights,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/reports/field-diary", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
