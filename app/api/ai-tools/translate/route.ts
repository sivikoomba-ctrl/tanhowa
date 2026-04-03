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

    const { text, direction } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }
    if (direction !== "en-ta" && direction !== "ta-en") {
      return NextResponse.json({ error: "Invalid direction. Use 'en-ta' or 'ta-en'" }, { status: 400 });
    }

    const sourceLang = direction === "en-ta" ? "English" : "Tamil";
    const targetLang = direction === "en-ta" ? "Tamil" : "English";

    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      {
        text: `Translate the following text from ${sourceLang} to ${targetLang}.

Rules:
- Provide ONLY the translation, no explanations or notes
- Maintain the original tone and formality level
- Preserve technical/horticultural terminology accurately
- For official/formal text, use formal ${targetLang}
- If the text contains proper nouns, transliterate them appropriately

Text to translate:
${text.trim()}`,
      },
    ]);

    const translation = result.response.text().trim();
    logContribution(session.userId, "used_ai_translation");

    return NextResponse.json({ translation });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/ai-tools/translate", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to translate" }, { status: 500 });
  }
}
