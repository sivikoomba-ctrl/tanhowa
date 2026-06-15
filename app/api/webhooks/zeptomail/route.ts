import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";

/**
 * ZeptoMail bounce/complaint webhook.
 *
 * Marks hard-bounced and spam-complained addresses on the user row so every
 * send path can skip them (`email_status != 'active'`). This protects sender
 * reputation — repeatedly emailing dead addresses is what threatens OTP
 * deliverability, the one email that must never fail.
 *
 * Secured by a shared secret in the URL query string (`?secret=...`) configured
 * on the ZeptoMail webhook. ZeptoMail's payload shape is only loosely
 * documented, so the parser is defensive: it accepts both `event_message[]` and
 * single-object payloads, normalises `event_name`, and pulls recipient
 * addresses from every place they're known to appear.
 *
 * Always returns 200 on a parseable request (even with 0 matches) so ZeptoMail
 * doesn't retry-storm; only auth/config problems return non-2xx.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectEvents(payload: any): any[] {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.event_message)) return payload.event_message;
  if (Array.isArray(payload.events)) return payload.events;
  if (Array.isArray(payload)) return payload;
  return [payload];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eventType(entry: any): string {
  const raw = entry?.event_name ?? entry?.eventName ?? entry?.event ?? "";
  const s = Array.isArray(raw) ? raw.join(" ") : String(raw);
  return s.toLowerCase().replace(/[\s_-]/g, ""); // "hard bounce" -> "hardbounce"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEmails(entry: any): string[] {
  const out = new Set<string>();
  const add = (e: unknown) => {
    if (typeof e === "string" && e.includes("@")) out.add(e.trim().toLowerCase());
  };
  const toArr = entry?.email_info?.to ?? entry?.to;
  if (Array.isArray(toArr)) {
    for (const t of toArr) add(t?.email_address?.address ?? t?.address ?? t);
  }
  const details = entry?.event_data?.details ?? entry?.details;
  const dArr = Array.isArray(details) ? details : details ? [details] : [];
  for (const d of dArr) {
    add(d?.bounced_recipient);
    add(d?.bounced_address);
    add(d?.email);
    add(d?.recipient);
  }
  add(entry?.event_data?.bounced_recipient);
  add(entry?.bounce_address);
  return Array.from(out);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reasonOf(entry: any): string {
  const details = entry?.event_data?.details ?? entry?.details;
  const d = Array.isArray(details) ? details[0] : details;
  return String(d?.reason || d?.bounce_reason || d?.diagnostic_message || "").slice(0, 300);
}

export async function POST(req: NextRequest) {
  // --- Auth: shared secret on the webhook URL ---
  const secret = process.env.ZEPTOMAIL_WEBHOOK_SECRET;
  if (!secret) {
    await logError({ type: "api", message: "ZEPTOMAIL_WEBHOOK_SECRET not configured", path: "/api/webhooks/zeptomail", method: "POST", status_code: 503 });
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  if (req.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await req.json().catch(() => null);
    const events = collectEvents(payload);

    // Map address -> { status, reason } for the events we care about.
    const updates = new Map<string, { status: "bounced" | "complained"; reason: string }>();
    for (const entry of events) {
      const type = eventType(entry);
      let status: "bounced" | "complained" | null = null;
      if (type.includes("hardbounce")) status = "bounced";
      else if (type.includes("spam") || type.includes("complaint")) status = "complained";
      // Soft bounces are transient — intentionally NOT suppressed.
      if (!status) continue;
      const reason = reasonOf(entry);
      for (const email of extractEmails(entry)) {
        // complaint outranks bounce if both arrive for the same address
        if (updates.get(email)?.status === "complained") continue;
        updates.set(email, { status, reason });
      }
    }

    if (updates.size === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    const supabase = getServiceClient();
    let marked = 0;
    for (const [email, { status, reason }] of updates) {
      const { data, error } = await supabase
        .from("users")
        .update({
          email_status: status,
          email_bounced_at: new Date().toISOString(),
          email_bounce_reason: reason || null,
        })
        .ilike("email", email)
        .neq("email_status", status) // don't churn rows already in this state
        .select("id");
      if (!error && data) marked += data.length;
    }

    return NextResponse.json({ ok: true, processed: updates.size, marked });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/webhooks/zeptomail", method: "POST", status_code: 500 });
    // Return 200 so ZeptoMail doesn't retry a payload we simply couldn't parse.
    return NextResponse.json({ ok: false, error: "handled" });
  }
}
