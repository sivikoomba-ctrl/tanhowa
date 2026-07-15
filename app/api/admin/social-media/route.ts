import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logAudit } from "@/lib/audit-log";
import { fetchAllRows } from "@/lib/supabase-helpers";

const TEST_EMAILS = new Set(["tanhowa19791@gmail.com", "tanhowaadmin@tanhowa.in"]);
const JUNK_VALUES = new Set(["nil", "n/a", "na", "none", "-", "instagram", "twitter", "linkedin", "whatsapp"]);
const METRICS_KEY = "official_social_metrics";

type Platform = "instagram" | "twitter" | "linkedin" | "whatsapp";
const PLATFORMS: Platform[] = ["instagram", "twitter", "linkedin", "whatsapp"];

interface OfficialMetrics {
  followers: number;
  posts: number;
  updated_at: string;
  updated_by: string;
}

function normalize(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const val = raw.trim();
  if (!val) return null;
  if (JUNK_VALUES.has(val.toLowerCase())) return null;
  return val;
}

/**
 * GET /api/admin/social-media — flat export of every approved member's
 * social_links fields (instagram/twitter/linkedin/whatsapp), for outreach
 * and copy/export use. Any admin/official (mirrors /api/roster's gate).
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();
    const rows = await fetchAllRows<{
      id: string;
      name: string | null;
      email: string;
      posting_details: Record<string, string> | null;
      social_links: Record<string, unknown> | null;
    }>((from, to) =>
      supabase
        .from("users")
        .select("id, name, email, posting_details, social_links")
        .eq("status", "approved")
        .range(from, to),
    );

    const approvedRows = rows.filter((u) => !TEST_EMAILS.has(u.email));
    const summary: Record<Platform, number> = { instagram: 0, twitter: 0, linkedin: 0, whatsapp: 0 };
    const members = approvedRows
      .map((u) => {
        const sl = u.social_links || {};
        const entry: Record<Platform, string | null> = { instagram: null, twitter: null, linkedin: null, whatsapp: null };
        for (const p of PLATFORMS) {
          entry[p] = normalize(sl[p]);
          if (entry[p]) summary[p]++;
        }
        return {
          id: u.id,
          name: u.name || "",
          district: (u.posting_details?.regular_district as string) || "",
          ...entry,
        };
      })
      .filter((m) => m.instagram || m.twitter || m.linkedin || m.whatsapp)
      .sort((a, b) => a.name.localeCompare(b.name));

    const { data: metricsRow } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", METRICS_KEY)
      .maybeSingle();
    let official_metrics: OfficialMetrics | null = null;
    if (metricsRow?.value) {
      try { official_metrics = JSON.parse(metricsRow.value); } catch { official_metrics = null; }
    }

    return NextResponse.json({ members, summary, total_approved: approvedRows.length, official_metrics });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/admin/social-media", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load social media data" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/social-media — manually record the official TANHOWA
 * Instagram account's follower/post counts (no live API integration —
 * an admin updates these by hand). Stored as a single JSON blob in
 * site_settings, same pattern as why_ministry_doc.
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const followers = Number(body.followers);
    const posts = Number(body.posts);
    if (!Number.isFinite(followers) || followers < 0 || !Number.isFinite(posts) || posts < 0) {
      return NextResponse.json({ error: "Invalid follower/post count" }, { status: 400 });
    }

    const metrics: OfficialMetrics = {
      followers: Math.round(followers),
      posts: Math.round(posts),
      updated_at: new Date().toISOString(),
      updated_by: session.email,
    };

    const supabase = getServiceClient();
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: METRICS_KEY, value: JSON.stringify(metrics) }, { onConflict: "key" });
    if (error) {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    logAudit(session.userId, "social_media_metrics_update", "site_settings", METRICS_KEY, { ...metrics });

    return NextResponse.json({ official_metrics: metrics });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/admin/social-media", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
