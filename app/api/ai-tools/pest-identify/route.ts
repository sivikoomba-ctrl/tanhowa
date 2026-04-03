import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGemini } from "@/lib/gemini";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter(10);

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
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too large (max 10MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const imageData = {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType: file.type,
      },
    };

    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      imageData,
      {
        text: `You are a plant pathologist specializing in Tamil Nadu crops and horticulture.

Analyze this image carefully. Identify any pest, disease, or deficiency visible on the plant.

Return ONLY a JSON object in this exact format:
{"pest_name": "string", "tamil_name": "string or null", "crop": "string", "severity": "mild|moderate|severe", "confidence": "high|medium|low", "treatment": "string", "prevention": "string", "additional_notes": "string or null"}

Rules:
- pest_name: Common English name of the pest or disease
- tamil_name: Tamil name if known, otherwise null
- crop: The crop/plant shown in the image
- severity: Assess visible damage level
- confidence: Your confidence in the identification
- treatment: Recommended treatment (chemical/organic options, dosage if applicable)
- prevention: Preventive measures for future
- additional_notes: Any extra info useful for the farmer
- If the image doesn't show a plant or no pest/disease is visible, return {"pest_name": "No pest/disease detected", "crop": "description of what you see", "severity": "none", "confidence": "high", "treatment": "N/A", "prevention": "General plant care", "tamil_name": null, "additional_notes": null}
- Do not include any explanation outside the JSON`,
      },
    ]);

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not analyze the image. Please try a clearer photo." }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    logContribution(session.userId, "used_ai_pest_id");

    return NextResponse.json(parsed);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/ai-tools/pest-identify", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to analyze image" }, { status: 500 });
  }
}
