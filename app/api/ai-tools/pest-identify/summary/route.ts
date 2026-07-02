import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGemini } from "@/lib/gemini";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter(10);
const GEMINI_MODEL = "gemini-2.5-flash";

interface SummaryInput {
  pest_name?: string;
  crop?: string;
  severity?: string;
  confidence?: string;
  treatment?: string;
  prevention?: string;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!limiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
    }

    const body = await req.json();
    const items: SummaryInput[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length < 2) {
      return NextResponse.json({ error: "Need at least 2 analyzed photos to summarize" }, { status: 400 });
    }
    if (items.length > 20) {
      return NextResponse.json({ error: "Too many photos (max 20)" }, { status: 400 });
    }

    const findings = items
      .map((it, i) => {
        return `Photo ${i + 1}: pest/disease="${it.pest_name || "?"}", crop="${it.crop || "?"}", severity="${it.severity || "?"}", confidence="${it.confidence || "?"}", treatment="${(it.treatment || "").slice(0, 400)}", prevention="${(it.prevention || "").slice(0, 300)}"`;
      })
      .join("\n");

    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent([
      {
        text: `You are a plant pathologist advising a Tamil Nadu horticulture field officer who analyzed ${items.length} plant photos in one batch. Below are the per-photo AI findings.

${findings}

Write a CONSOLIDATED field conclusion that reads across ALL the photos together — not a repeat of each photo. Return ONLY a JSON object in this exact shape:
{"overview": "string", "top_concern": "string", "affected_crops": ["string"], "priority_actions": ["string"], "watch_out": "string or null"}

Rules:
- overview: 2-3 sentence plain-language summary of the overall plant-health picture across the batch (mention how many photos showed a problem vs. healthy, and any recurring pest/disease).
- top_concern: the single most urgent issue to act on first, and why (reference the crop/severity).
- affected_crops: distinct crops that showed a pest/disease/deficiency (empty array if none).
- priority_actions: 3-5 concrete, ordered next steps for the officer (dosage/timing where useful, organic + chemical option when relevant). Consolidate — if several photos need the same treatment, say it once.
- watch_out: one preventive caution for the coming weeks, or null.
- Be specific to the findings above; do not invent problems not present. If everything looks healthy, say so and give general upkeep advice.
- Do not include any text outside the JSON.`,
      },
    ]);

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not generate a summary. Please try again." }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    logContribution(session.userId, "used_ai_pest_id");

    return NextResponse.json({
      overview: parsed.overview || "",
      top_concern: parsed.top_concern || "",
      affected_crops: Array.isArray(parsed.affected_crops) ? parsed.affected_crops : [],
      priority_actions: Array.isArray(parsed.priority_actions) ? parsed.priority_actions : [],
      watch_out: parsed.watch_out || null,
      count: items.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/ai-tools/pest-identify/summary", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
}
