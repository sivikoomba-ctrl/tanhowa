import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();

    const { data: users, error } = await supabase
      .from("users")
      .select("id, name, phone, occupation, photo_url, posting_details, created_at, last_active_at, login_count, status")
      .eq("status", "approved");

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/reports/members", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }

    const members = users || [];
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Registration trend by month
    const monthMap = new Map<string, number>();
    for (const m of members) {
      const d = new Date(m.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    }
    const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    let cumulative = 0;
    const registrationTrend = sortedMonths.map(([month, count]) => {
      cumulative += count;
      return { month, count, cumulative };
    });

    // District distribution
    const districtMap = new Map<string, number>();
    for (const m of members) {
      const pd = m.posting_details as { regular_district?: string } | null;
      const district = pd?.regular_district || "Unassigned";
      districtMap.set(district, (districtMap.get(district) || 0) + 1);
    }
    const districtDistribution = Array.from(districtMap.entries())
      .map(([district, count]) => ({ district, count }))
      .sort((a, b) => b.count - a.count);

    // Profile completion
    let complete = 0, partial = 0, minimal = 0;
    for (const m of members) {
      const pd = m.posting_details as { regular_district?: string } | null;
      const hasName = !!m.name;
      const hasPhone = !!m.phone;
      const hasOccupation = !!m.occupation;
      const hasDistrict = !!pd?.regular_district;
      const hasPhoto = !!m.photo_url;

      if (hasName && hasPhone && hasOccupation && hasDistrict && hasPhoto) complete++;
      else if (hasName && hasPhone && hasOccupation) partial++;
      else minimal++;
    }

    // Login activity
    const activeThisWeek = members.filter((m) => m.last_active_at && new Date(m.last_active_at) >= weekAgo).length;
    const activeThisMonth = members.filter((m) => m.last_active_at && new Date(m.last_active_at) >= monthAgo).length;
    const neverLoggedIn = members.filter((m) => !m.login_count || m.login_count === 0).length;
    const totalLogins = members.reduce((sum, m) => sum + (m.login_count || 0), 0);
    const averageLoginCount = members.length > 0 ? totalLogins / members.length : 0;

    return NextResponse.json({
      registrationTrend,
      districtDistribution,
      profileCompletion: { complete, partial, minimal },
      loginActivity: { activeThisWeek, activeThisMonth, neverLoggedIn, averageLoginCount },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/reports/members", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to generate member report" }, { status: 500 });
  }
}
