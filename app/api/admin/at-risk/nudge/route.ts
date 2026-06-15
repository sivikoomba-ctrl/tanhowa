import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logAudit } from "@/lib/audit";
import { nudgeMember, nudgeCooldownCutoffISO, NUDGE_COOLDOWN_DAYS } from "@/lib/inactive-nudge";

const OWNER_EMAIL = "tanhowa19791@gmail.com";
const EXEMPT_EMAILS = new Set([OWNER_EMAIL, "tanhowaadmin@tanhowa.in"]);
const MAX_BATCH = 500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface Row {
  id: string;
  name: string | null;
  email: string | null;
  telegram_chat_id: string | null;
  status: string;
  last_inactive_nudge_at: string | null;
  email_status: string | null;
}

/**
 * Owner-only scoped nudge — the manual counterpart to the daily inactive-nudge
 * cron. Body: { userIds: string[] }. Re-reads each member from the DB (never
 * trusts client-supplied contact data), honours the same 15-day cooldown, and
 * delivers via the shared `nudgeMember()` path. Returns a per-outcome tally.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.email !== OWNER_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const userIds: unknown = body?.userIds;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "userIds required" }, { status: 400 });
    }
    const ids = Array.from(new Set(userIds.filter((x): x is string => typeof x === "string"))).slice(0, MAX_BATCH);
    if (ids.length === 0) {
      return NextResponse.json({ error: "No valid userIds" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, telegram_chat_id, status, last_inactive_nudge_at, email_status")
      .in("id", ids);
    if (error) throw new Error(error.message);

    const rows = (data || []) as Row[];
    const cooldownCutoff = nudgeCooldownCutoffISO();

    let sent = 0;
    let skippedCooldown = 0;
    let skippedNoChannel = 0;
    let skippedIneligible = 0;
    let failed = 0;

    for (const u of rows) {
      if (u.status !== "approved" || EXEMPT_EMAILS.has((u.email || "").toLowerCase())) {
        skippedIneligible++;
        continue;
      }
      if (u.last_inactive_nudge_at && u.last_inactive_nudge_at > cooldownCutoff) {
        skippedCooldown++;
        continue;
      }
      // A bounced/complained address is not a usable channel.
      const emailUsable = !!u.email && (u.email_status ?? "active") === "active";
      if (!emailUsable && !u.telegram_chat_id) {
        skippedNoChannel++;
        continue;
      }
      const { emailed, telegrammed } = await nudgeMember(supabase, u);
      if (emailed || telegrammed) sent++;
      else failed++;
      if (emailed) await sleep(250); // stay under Gmail's bulk threshold
    }

    logAudit({
      user_id: session.userId,
      user_email: session.email,
      action: "at_risk_nudge_sent",
      target_type: "users",
      details: { requested: ids.length, sent, skippedCooldown, skippedNoChannel, skippedIneligible, failed },
    });

    return NextResponse.json({
      ok: true,
      requested: ids.length,
      sent,
      skippedCooldown,
      skippedNoChannel,
      skippedIneligible,
      failed,
      cooldownDays: NUDGE_COOLDOWN_DAYS,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/admin/at-risk/nudge", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to send nudges" }, { status: 500 });
  }
}
