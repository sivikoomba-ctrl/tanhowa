import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGemini } from "@/lib/gemini";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter(5);

const CATEGORIES = ["Training", "Infrastructure", "Events", "Digital Tools", "Policy", "Welfare", "Communication", "Other"];

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

    const formData = await req.formData();
    const file = formData.get("audio") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio too large (max 5MB / 60 seconds)" }, { status: 400 });
    }
    if (file.size < 2 * 1024) {
      return NextResponse.json({ error: "Recording too short" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const audioData = {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType: file.type || "audio/webm",
      },
    };

    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      audioData,
      {
        text: `This audio is from a Tamil Nadu horticulture officer describing an idea for the TANHOWA member portal. The speech may be in Tamil, English, or a mix of both. Listen carefully and convert the speaker's idea into clean English.

Return ONLY a JSON object with these fields:
{
  "title": "<short 5-10 word headline summarising the idea>",
  "description": "<2-4 sentence detailed description of the idea in clear English>",
  "category": "<one of: ${CATEGORIES.join(", ")}> — pick the best fit, or 'Other' if unclear"
}

Rules:
- Translate Tamil portions into English; do not output Tamil script
- Preserve the speaker's intent — don't invent details they didn't mention
- If the audio is unclear, garbled, or contains no idea, return: { "title": "", "description": "", "category": "" }
- Output ONLY the JSON object, no markdown, no extra text`,
      },
    ]);

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not understand the recording. Please try again." }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.title || !parsed.description) {
      return NextResponse.json({ error: "Could not detect a clear idea in the recording. Please try again." }, { status: 422 });
    }

    if (!CATEGORIES.includes(parsed.category)) {
      parsed.category = "";
    }

    logContribution(session.userId, "voice_idea_transcribed", "Recorded an idea by voice");

    return NextResponse.json({
      title: String(parsed.title).slice(0, 200),
      description: String(parsed.description).slice(0, 2000),
      category: parsed.category || "",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/ai-tools/transcribe-idea", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Transcription failed. Please try again." }, { status: 500 });
  }
}
