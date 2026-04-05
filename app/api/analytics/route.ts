import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, SUPER_ADMIN_EMAILS } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { createRateLimiter } from "@/lib/rate-limit";

const postLimiter = createRateLimiter(30);

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!postLimiter.check(ip)) {
      return NextResponse.json({ ok: true }); // Silent drop
    }

    const events = await req.json();
    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const supabase = getServiceClient();
    const cleaned = events.slice(0, 20).map((e) => ({
      user_id: typeof e.user_id === "string" ? e.user_id : null,
      event_type: e.event_type === "click" ? "click" : "page_view",
      page_path: String(e.page_path || "/").slice(0, 500),
      element_id: e.element_id ? String(e.element_id).slice(0, 200) : null,
      element_text: e.element_text ? String(e.element_text).slice(0, 100) : null,
      device_type: e.device_type === "mobile" ? "mobile" : "desktop",
      screen_width: typeof e.screen_width === "number" ? e.screen_width : null,
      screen_height: typeof e.screen_height === "number" ? e.screen_height : null,
      user_agent: e.user_agent ? String(e.user_agent).slice(0, 500) : null,
      referrer: e.referrer ? String(e.referrer).slice(0, 500) : null,
      session_id: e.session_id ? String(e.session_id).slice(0, 50) : null,
    }));

    await supabase.from("analytics_events").insert(cleaned);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Never fail client
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !SUPER_ADMIN_EMAILS.has(session.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "7d";
    const type = url.searchParams.get("type") || "summary";

    const days = period === "90d" ? 90 : period === "30d" ? 30 : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    if (type === "summary") {
      const { data: events } = await supabase
        .from("analytics_events")
        .select("event_type, user_id, session_id")
        .gte("created_at", since);

      const all = events || [];
      const pageViews = all.filter((e) => e.event_type === "page_view").length;
      const clicks = all.filter((e) => e.event_type === "click").length;
      const uniqueUsers = new Set(all.filter((e) => e.user_id).map((e) => e.user_id)).size;
      const uniqueSessions = new Set(all.filter((e) => e.session_id).map((e) => e.session_id)).size;
      const avgPages = uniqueSessions > 0 ? Math.round(pageViews / uniqueSessions * 10) / 10 : 0;

      return NextResponse.json({ pageViews, clicks, uniqueUsers, uniqueSessions, avgPages });
    }

    if (type === "pages") {
      const { data: events } = await supabase
        .from("analytics_events")
        .select("page_path, user_id")
        .eq("event_type", "page_view")
        .gte("created_at", since);

      const pageCounts: Record<string, { views: number; users: Set<string> }> = {};
      for (const e of events || []) {
        if (!pageCounts[e.page_path]) pageCounts[e.page_path] = { views: 0, users: new Set() };
        pageCounts[e.page_path].views++;
        if (e.user_id) pageCounts[e.page_path].users.add(e.user_id);
      }

      const pages = Object.entries(pageCounts)
        .map(([path, d]) => ({ path, views: d.views, uniqueUsers: d.users.size }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 20);

      return NextResponse.json({ pages });
    }

    if (type === "clicks") {
      const { data: events } = await supabase
        .from("analytics_events")
        .select("page_path, element_text, element_id")
        .eq("event_type", "click")
        .gte("created_at", since);

      const clickCounts: Record<string, { count: number; page: string }> = {};
      for (const e of events || []) {
        const key = `${e.element_text || e.element_id || "unknown"}|||${e.page_path}`;
        if (!clickCounts[key]) clickCounts[key] = { count: 0, page: e.page_path };
        clickCounts[key].count++;
      }

      const clicks = Object.entries(clickCounts)
        .map(([key, d]) => ({ text: key.split("|||")[0], page: d.page, count: d.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);

      return NextResponse.json({ clicks });
    }

    if (type === "devices") {
      const { data: events } = await supabase
        .from("analytics_events")
        .select("device_type, session_id")
        .eq("event_type", "page_view")
        .gte("created_at", since);

      const sessions = new Map<string, string>();
      for (const e of events || []) {
        if (e.session_id && !sessions.has(e.session_id)) {
          sessions.set(e.session_id, e.device_type || "desktop");
        }
      }

      let mobile = 0, desktop = 0;
      for (const d of sessions.values()) {
        if (d === "mobile") mobile++;
        else desktop++;
      }

      return NextResponse.json({ mobile, desktop, total: mobile + desktop });
    }

    if (type === "daily") {
      const { data: events } = await supabase
        .from("analytics_events")
        .select("created_at, session_id")
        .eq("event_type", "page_view")
        .gte("created_at", since);

      const dailyCounts: Record<string, { views: number; sessions: Set<string> }> = {};
      for (const e of events || []) {
        const day = e.created_at.slice(0, 10);
        if (!dailyCounts[day]) dailyCounts[day] = { views: 0, sessions: new Set() };
        dailyCounts[day].views++;
        if (e.session_id) dailyCounts[day].sessions.add(e.session_id);
      }

      const daily = Object.entries(dailyCounts)
        .map(([date, d]) => ({ date, views: d.views, sessions: d.sessions.size }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return NextResponse.json({ daily });
    }

    if (type === "perf") {
      const { data: perfData } = await supabase
        .from("api_perf")
        .select("path, method, status_code, duration_ms, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);

      const entries = perfData || [];
      // Aggregate by path
      const pathStats: Record<string, { count: number; totalMs: number; maxMs: number; errors: number }> = {};
      for (const e of entries) {
        if (!pathStats[e.path]) pathStats[e.path] = { count: 0, totalMs: 0, maxMs: 0, errors: 0 };
        pathStats[e.path].count++;
        pathStats[e.path].totalMs += e.duration_ms;
        pathStats[e.path].maxMs = Math.max(pathStats[e.path].maxMs, e.duration_ms);
        if (e.status_code >= 400) pathStats[e.path].errors++;
      }

      const routes = Object.entries(pathStats)
        .map(([path, s]) => ({
          path,
          count: s.count,
          avgMs: Math.round(s.totalMs / s.count),
          maxMs: s.maxMs,
          errors: s.errors,
        }))
        .sort((a, b) => b.avgMs - a.avgMs);

      const overallAvg = entries.length > 0 ? Math.round(entries.reduce((s, e) => s + e.duration_ms, 0) / entries.length) : 0;
      const slowCount = entries.filter((e) => e.duration_ms > 1000).length;

      return NextResponse.json({ routes, overallAvg, slowCount, totalRequests: entries.length });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/analytics", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
