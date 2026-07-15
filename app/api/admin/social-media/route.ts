import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { fetchAllRows } from "@/lib/supabase-helpers";

const TEST_EMAILS = new Set(["tanhowa19791@gmail.com", "tanhowaadmin@tanhowa.in"]);
const JUNK_VALUES = new Set(["nil", "n/a", "na", "none", "-", "instagram", "twitter", "linkedin", "whatsapp"]);

type Platform = "instagram" | "twitter" | "linkedin" | "whatsapp";
const PLATFORMS: Platform[] = ["instagram", "twitter", "linkedin", "whatsapp"];

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

    return NextResponse.json({ members, summary, total_approved: approvedRows.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/admin/social-media", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load social media data" }, { status: 500 });
  }
}
