/**
 * Owner-only feedback pulse — pulls the past 30 days of qualitative
 * member feedback from `feedback`, `grievances`, `wishlist_ideas`, and
 * `chat_messages`, then asks Gemini to extract themes and highlights.
 * Caches the AI summary in site_settings for 1 hour to avoid re-running
 * on every page load.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase";
import { getGemini } from "@/lib/gemini";
import { logError } from "@/lib/error-logger";

const OWNER_EMAIL = "tanhowa19791@gmail.com";
const CACHE_KEY = "feedback_pulse_cache";
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

interface FeedbackRow {
  id: string;
  source: string;
  rating: number | null;
  reason: string | null;
  comment: string | null;
  page_url: string | null;
  created_at: string;
  user_id: string | null;
}

interface PulseSummary {
  generated_at: string;
  window_days: number;
  totals: {
    feedback_rows: number;
    grievances: number;
    suggestions: number;
    ideas: number;
    average_rating: number | null;
    rating_count: number;
  };
  source_breakdown: Record<string, number>;
  top_reasons: { reason: string; count: number }[];
  themes: string[];
  highlights: { kind: "praise" | "complaint" | "request"; text: string }[];
  recommended_actions: string[];
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.email !== OWNER_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();
    const url = new URL("http://x");
    void url; // keep tsc happy

    // Cache hit?
    const { data: cached } = await supabase
      .from("site_settings")
      .select("value, updated_at")
      .eq("key", CACHE_KEY)
      .maybeSingle();
    if (cached?.value && cached.updated_at) {
      const age = Date.now() - new Date(cached.updated_at).getTime();
      if (age < CACHE_TTL_MS) {
        try {
          return NextResponse.json({ summary: JSON.parse(cached.value), cached: true });
        } catch {
          // Fall through and regenerate
        }
      }
    }

    const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();

    const [feedbackRes, grievancesRes, ideasRes] = await Promise.all([
      supabase
        .from("feedback")
        .select("id, source, rating, reason, comment, page_url, created_at, user_id")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("grievances")
        .select("id, category, subject, description, created_at")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("wishlist_ideas")
        .select("id, category, title, description, upvote_count, created_at")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const feedback: FeedbackRow[] = (feedbackRes.data as FeedbackRow[]) || [];
    const grievances = grievancesRes.data || [];
    const ideas = ideasRes.data || [];

    // Tally numbers without LLM
    const ratings = feedback.map((f) => f.rating).filter((r): r is number => typeof r === "number");
    const ratingCount = ratings.length;
    const avgRating = ratingCount > 0 ? ratings.reduce((a, b) => a + b, 0) / ratingCount : null;

    const sourceBreakdown: Record<string, number> = {};
    for (const f of feedback) sourceBreakdown[f.source] = (sourceBreakdown[f.source] || 0) + 1;

    const reasonTally: Record<string, number> = {};
    for (const f of feedback) {
      if (f.reason) reasonTally[f.reason] = (reasonTally[f.reason] || 0) + 1;
    }
    const topReasons = Object.entries(reasonTally)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const grievanceCount = grievances.filter((g: { category: string }) => g.category !== "Suggestion").length;
    const suggestionCount = grievances.filter((g: { category: string }) => g.category === "Suggestion").length;

    // Build a compact corpus for Gemini
    const compactItems: { kind: string; text: string }[] = [];
    for (const f of feedback) {
      const parts = [
        f.rating ? `${f.rating}/5` : null,
        f.reason || null,
        f.comment || null,
      ].filter(Boolean);
      if (parts.length > 0) compactItems.push({ kind: `feedback:${f.source}`, text: parts.join(" — ") });
    }
    for (const g of grievances as { category: string; subject: string; description: string }[]) {
      compactItems.push({
        kind: g.category === "Suggestion" ? "suggestion" : "grievance",
        text: `${g.subject} — ${(g.description || "").slice(0, 400)}`,
      });
    }
    for (const i of ideas as { title: string; description: string; upvote_count: number; category: string }[]) {
      compactItems.push({
        kind: `idea:${i.category}`,
        text: `(+${i.upvote_count}) ${i.title} — ${(i.description || "").slice(0, 400)}`,
      });
    }

    let themes: string[] = [];
    let highlights: PulseSummary["highlights"] = [];
    let recommended: string[] = [];

    if (compactItems.length > 0) {
      try {
        const genAI = getGemini();
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `You are summarising 30 days of member feedback for a Tamil Nadu horticultural officers' association portal.

Items below are tagged with their source (feedback widget rating + comment, re-engagement reason, grievance, suggestion, or wishlist idea with upvote count).

Return ONLY a JSON object with this exact shape, no markdown:
{
  "themes": [string],            // up to 6 short phrases describing recurring patterns
  "highlights": [{"kind": "praise"|"complaint"|"request", "text": string}],  // up to 8 verbatim or near-verbatim quotes worth surfacing
  "recommended_actions": [string]  // up to 5 concrete suggestions for the State-Admin
}

Rules:
- Be concrete. Avoid generic advice ("improve UX"). Mention specific features when patterns are feature-specific.
- Tamil text is fine to leave as-is; do not translate.
- Empty arrays are valid if there isn't enough signal.

Items:
${compactItems.map((it, i) => `[${i + 1}] (${it.kind}) ${it.text}`).join("\n")}`;

        const result = await model.generateContent([{ text: prompt }]);
        let text = result.response.text().trim();
        if (text.startsWith("```")) {
          text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
        }
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.themes)) themes = parsed.themes.filter((s: unknown) => typeof s === "string").slice(0, 6);
        if (Array.isArray(parsed.highlights)) {
          highlights = parsed.highlights
            .filter((h: { kind?: string; text?: string }) => h && typeof h.text === "string" && ["praise", "complaint", "request"].includes(h.kind || ""))
            .slice(0, 8) as PulseSummary["highlights"];
        }
        if (Array.isArray(parsed.recommended_actions)) {
          recommended = parsed.recommended_actions.filter((s: unknown) => typeof s === "string").slice(0, 5);
        }
      } catch (err) {
        await logError({
          type: "api",
          message: `feedback-pulse Gemini call failed: ${err instanceof Error ? err.message : String(err)}`,
          path: "/api/admin/feedback-pulse",
          method: "GET",
          status_code: 200,
        });
      }
    }

    const summary: PulseSummary = {
      generated_at: new Date().toISOString(),
      window_days: 30,
      totals: {
        feedback_rows: feedback.length,
        grievances: grievanceCount,
        suggestions: suggestionCount,
        ideas: ideas.length,
        average_rating: avgRating != null ? Math.round(avgRating * 10) / 10 : null,
        rating_count: ratingCount,
      },
      source_breakdown: sourceBreakdown,
      top_reasons: topReasons,
      themes,
      highlights,
      recommended_actions: recommended,
    };

    await supabase
      .from("site_settings")
      .upsert({ key: CACHE_KEY, value: JSON.stringify(summary) }, { onConflict: "key" });

    return NextResponse.json({ summary, cached: false });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/feedback-pulse", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// Force a refresh — bumps the cache by deleting it.
export async function POST() {
  try {
    const session = await getSession();
    if (!session || session.email !== OWNER_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const supabase = getServiceClient();
    await supabase.from("site_settings").delete().eq("key", CACHE_KEY);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/feedback-pulse", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// Owner-only: list raw feedback rows with user names for admin UI
export async function PUT() {
  try {
    const session = await getSession();
    if (!session || session.email !== OWNER_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const supabase = getServiceClient();
    const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
    const { data } = await supabase
      .from("feedback")
      .select("id, source, rating, reason, comment, page_url, created_at, users:user_id(name, email)")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(200);
    return NextResponse.json({ feedback: data || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/feedback-pulse", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
