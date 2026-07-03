import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getOfficialInfo } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { fetchAllRows } from "@/lib/supabase-helpers";
import { todayIST } from "@/lib/field-diary";

interface MemberRow {
  id: string;
  name: string;
  photo_url: string | null;
  posting_details: { regular_district?: string } | null;
}

/**
 * Admin/official compliance view for a single day: who has and hasn't
 * submitted a Field Diary entry. Read-side aggregation only — never gates
 * or blocks the member's own submission.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const info = await getOfficialInfo(session.userId);
    const isStateLevel = info.role === "super_admin" || info.official_type === "state";
    const isDistrictLevel = info.official_type === "district";
    if (!isStateLevel && !isDistrictLevel) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const date = url.searchParams.get("date") || todayIST();

    let districtFilter: string | null = null;
    if (isDistrictLevel) {
      if (!info.district) {
        return NextResponse.json({ error: "Set your district in your profile to view compliance" }, { status: 403 });
      }
      districtFilter = info.district;
    } else {
      districtFilter = url.searchParams.get("district");
    }

    const supabase = getServiceClient();

    const usersQuery = (from: number, to: number) => {
      let q = supabase
        .from("users")
        .select("id, name, photo_url, posting_details")
        .eq("status", "approved")
        .range(from, to);
      if (districtFilter) q = q.eq("posting_details->>regular_district", districtFilter);
      return q;
    };
    const members = await fetchAllRows<MemberRow>(usersQuery);
    const memberIds = members.map((m) => m.id);

    const { data: entriesToday } = await supabase
      .from("field_diary_entries")
      .select("member_id")
      .eq("entry_date", date)
      .in("member_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
    const submittedIds = new Set((entriesToday || []).map((e) => e.member_id as string));

    // Last-submitted date per member (for the "missed 3+ days" flag) — look
    // back over the last 14 days so we only need one bounded query.
    const since = new Date(new Date(date + "T00:00:00Z").getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: recentEntries } = await supabase
      .from("field_diary_entries")
      .select("member_id, entry_date")
      .gte("entry_date", since)
      .lte("entry_date", date)
      .in("member_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"])
      .order("entry_date", { ascending: false });

    const lastSubmitted = new Map<string, string>();
    for (const e of recentEntries || []) {
      if (!lastSubmitted.has(e.member_id as string)) lastSubmitted.set(e.member_id as string, e.entry_date as string);
    }

    const dateMs = new Date(date + "T00:00:00Z").getTime();
    const missedStreak: { id: string; name: string; district: string; lastSubmitted: string | null; daysMissed: number }[] = [];

    const byDistrict: Record<string, { district: string; total: number; submitted: number }> = {};
    const notSubmitted: { id: string; name: string; district: string; photo_url: string | null }[] = [];

    for (const m of members) {
      const district = m.posting_details?.regular_district || "Unknown";
      if (!byDistrict[district]) byDistrict[district] = { district, total: 0, submitted: 0 };
      byDistrict[district].total += 1;
      const submitted = submittedIds.has(m.id);
      if (submitted) byDistrict[district].submitted += 1;
      else notSubmitted.push({ id: m.id, name: m.name, district, photo_url: m.photo_url });

      const last = lastSubmitted.get(m.id) || null;
      const daysMissed = last ? Math.round((dateMs - new Date(last + "T00:00:00Z").getTime()) / 86400000) : 15;
      if (daysMissed >= 3) {
        missedStreak.push({ id: m.id, name: m.name, district, lastSubmitted: last, daysMissed });
      }
    }

    missedStreak.sort((a, b) => b.daysMissed - a.daysMissed);

    const districts = Object.values(byDistrict)
      .map((d) => ({ ...d, complianceRate: d.total ? Math.round((d.submitted / d.total) * 100) : 0 }))
      .sort((a, b) => a.district.localeCompare(b.district));

    const totalMembers = members.length;
    const totalSubmitted = submittedIds.size;

    return NextResponse.json({
      date,
      scope: districtFilter ? "district" : "all",
      district: districtFilter,
      totalMembers,
      totalSubmitted,
      complianceRate: totalMembers ? Math.round((totalSubmitted / totalMembers) * 100) : 0,
      districts,
      notSubmitted: notSubmitted.sort((a, b) => a.district.localeCompare(b.district)),
      missedStreak: missedStreak.slice(0, 50),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/field-diary/compliance", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to compute compliance" }, { status: 500 });
  }
}
