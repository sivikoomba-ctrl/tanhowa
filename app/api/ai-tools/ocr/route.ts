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
        text: `Extract all text from this image. Follow these rules:
- Preserve the original layout and formatting as much as possible
- If the text is in Tamil, output it in Tamil script
- If mixed languages (English and Tamil), preserve both
- Maintain paragraph breaks and list structures
- If this is a table or form, format it clearly with alignment
- If no text is found, respond with: "No text detected in the image."
- Output ONLY the extracted text, no explanations or metadata`,
      },
    ]);

    const text = result.response.text().trim();
    logContribution(session.userId, "used_ai_ocr");

    return NextResponse.json({ text });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/ai-tools/ocr", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to extract text" }, { status: 500 });
  }
}
