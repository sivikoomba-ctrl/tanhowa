import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { nudgeCooldownCutoffISO } from "@/lib/inactive-nudge";

// Owner-only — same gate as engagement analytics. Keeps at-risk PII in one place.
const OWNER_EMAIL = "tanhowa19791@gmail.com";
// Service/admin accounts that should never appear as "at-risk".
const EXEMPT_EMAILS = new Set([OWNER_EMAIL, "tanhowaadmin@tanhowa.in"]);

type Band = "never_activated" | "lapsing" | "incomplete";

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  last_active_at: string | null;
  login_count: number | null;
  last_inactive_nudge_at: string | null;
  telegram_chat_id: string | null;
  created_at: string | null;
  posting_details: { regular_district?: string } | null;
  email_status: string | null;
}

/**
 * Owner-only "At-Risk Members" worklist. Classifies approved members into three
 * actionable bands so the owner can scope a manual nudge (the targeted
 * counterpart to the daily inactive-nudge cron):
 *   never_activated — signed up, never actually used the portal
 *   lapsing         — was active before, now quiet 30+ days
 *   incomplete      — reachable & recently active but no district set (unrouteable)
 * Healthy members (active + district set) are excluded entirely.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.email !== OWNER_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, last_active_at, login_count, last_inactive_nudge_at, telegram_chat_id, created_at, posting_details, email_status")
      .eq("status", "approved");
    if (error) throw new Error(error.message);

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const cooldownCutoff = nudgeCooldownCutoffISO();

    function classify(u: UserRow): Band | null {
      const loginCount = u.login_count || 0;
      const lastActiveMs = u.last_active_at ? new Date(u.last_active_at).getTime() : null;
      const hasDistrict = !!(u.posting_details?.regular_district || "").trim();
      if (!lastActiveMs || loginCount === 0) return "never_activated";
      if (lastActiveMs < thirtyDaysAgo) return "lapsing";
      if (!hasDistrict) return "incomplete";
      return null; // healthy — excluded
    }

    const members = ((data || []) as UserRow[])
      .filter((u) => !EXEMPT_EMAILS.has((u.email || "").toLowerCase()))
      .map((u) => {
        const band = classify(u);
        if (!band) return null;
        const lastActiveMs = u.last_active_at ? new Date(u.last_active_at).getTime() : null;
        const emailDeliverable = !!u.email && (u.email_status ?? "active") === "active";
        return {
          id: u.id,
          name: u.name || "",
          email: u.email,
          band,
          lastActive: u.last_active_at,
          daysInactive: lastActiveMs ? Math.floor((now - lastActiveMs) / (24 * 60 * 60 * 1000)) : null,
          loginCount: u.login_count || 0,
          district: (u.posting_details?.regular_district || "").trim() || null,
          hasTelegram: !!u.telegram_chat_id,
          hasEmail: emailDeliverable,
          emailBounced: !!u.email && (u.email_status ?? "active") !== "active",
          lastNudgedAt: u.last_inactive_nudge_at,
          onCooldown: !!(u.last_inactive_nudge_at && u.last_inactive_nudge_at > cooldownCutoff),
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => {
        // never-activated first, then most-inactive first within band
        if (a.daysInactive === null && b.daysInactive !== null) return -1;
        if (a.daysInactive !== null && b.daysInactive === null) return 1;
        return (b.daysInactive || 0) - (a.daysInactive || 0);
      });

    const counts = {
      never_activated: members.filter((m) => m.band === "never_activated").length,
      lapsing: members.filter((m) => m.band === "lapsing").length,
      incomplete: members.filter((m) => m.band === "incomplete").length,
      total: members.length,
      onCooldown: members.filter((m) => m.onCooldown).length,
    };

    return NextResponse.json({ members, counts, generatedAt: new Date().toISOString() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/admin/at-risk", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load at-risk members" }, { status: 500 });
  }
}
