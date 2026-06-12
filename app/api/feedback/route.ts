/**
 * Feedback collection — accepts submissions from:
 *   - the floating widget (auth: session cookie)
 *   - the re-engagement modal (auth: session cookie, source = "re_engagement")
 *   - the inactive-email landing page (auth: signed token in body)
 */
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getSession } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";
import { writeLimiter } from "@/lib/rate-limit";
import { getJwtSecretKey } from "@/lib/jwt-secret";

const VALID_SOURCES = new Set(["widget", "re_engagement", "inactive_email"]);
const MAX_COMMENT = 4000;
const MAX_REASON = 80;
const MAX_PAGE_URL = 500;

interface FeedbackTokenPayload {
  userId: string;
  purpose: "feedback";
  exp?: number;
}

async function verifyFeedbackToken(token: string): Promise<FeedbackTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    if ((payload as { purpose?: string }).purpose !== "feedback") return null;
    if (typeof (payload as { userId?: string }).userId !== "string") return null;
    return payload as unknown as FeedbackTokenPayload;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const { source, rating, reason, comment, page_url, token } = body || {};

    if (!source || !VALID_SOURCES.has(source)) {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }

    let userId: string | null = null;

    if (source === "inactive_email") {
      if (typeof token !== "string" || !token) {
        return NextResponse.json({ error: "Token required" }, { status: 401 });
      }
      const payload = await verifyFeedbackToken(token);
      if (!payload) {
        return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
      }
      userId = payload.userId;
    } else {
      const session = await getSession();
      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = session.userId;
    }

    if (rating !== undefined && rating !== null) {
      if (typeof rating !== "number" || rating < 1 || rating > 5) {
        return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
      }
    }
    if (reason !== undefined && reason !== null && (typeof reason !== "string" || reason.length > MAX_REASON)) {
      return NextResponse.json({ error: "Reason too long" }, { status: 400 });
    }
    if (comment !== undefined && comment !== null && (typeof comment !== "string" || comment.length > MAX_COMMENT)) {
      return NextResponse.json({ error: "Comment too long" }, { status: 400 });
    }
    if (page_url !== undefined && page_url !== null && (typeof page_url !== "string" || page_url.length > MAX_PAGE_URL)) {
      return NextResponse.json({ error: "page_url too long" }, { status: 400 });
    }

    const hasContent = (rating != null) || (reason && reason.trim()) || (comment && comment.trim());
    if (!hasContent) {
      return NextResponse.json({ error: "Provide a rating, reason, or comment" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { error } = await supabase.from("feedback").insert({
      user_id: userId,
      source,
      rating: typeof rating === "number" ? rating : null,
      reason: reason ? String(reason).trim() : null,
      comment: comment ? String(comment).trim() : null,
      page_url: page_url ? String(page_url).trim() : null,
      metadata: null,
    });

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/feedback", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    if (source === "re_engagement" && userId) {
      await supabase
        .from("feedback_prompts_shown")
        .upsert(
          { user_id: userId, kind: "re_engagement", responded: true, shown_at: new Date().toISOString() },
          { onConflict: "user_id,kind" },
        );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/feedback", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

// Light helper for the dashboard: did the current user already see the
// re-engagement modal? Used to skip showing it twice.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    const { data } = await supabase
      .from("feedback_prompts_shown")
      .select("kind, responded, shown_at")
      .eq("user_id", session.userId);

    return NextResponse.json({ prompts: data || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/feedback", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
