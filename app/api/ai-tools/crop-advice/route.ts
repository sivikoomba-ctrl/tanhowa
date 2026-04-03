import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGemini } from "@/lib/gemini";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter(20);

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

    const { question } = await req.json();
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      {
        text: `You are a senior horticultural advisor for Tamil Nadu, India. You specialize in all aspects of horticulture including fruits, vegetables, flowers, spices, plantation crops, medicinal plants, and landscape gardening.

Answer the following question with practical, actionable advice suitable for Tamil Nadu's agro-climatic zones. Include:
- Specific variety names (local and scientific where relevant)
- Quantities, dosages, and timings where applicable
- Season-specific guidance (Tamil Nadu has distinct seasons)
- Both organic and chemical options when discussing treatments
- Tamil names in parentheses where helpful

Keep the response concise but thorough. Use bullet points for readability. Respond in the same language the user writes in (English or Tamil).

Question: ${question.trim()}`,
      },
    ]);

    const advice = result.response.text();
    logContribution(session.userId, "used_ai_crop_advice");

    return NextResponse.json({ advice });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/ai-tools/crop-advice", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to get advice" }, { status: 500 });
  }
}
