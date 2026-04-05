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
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileData = {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType: file.type,
      },
    };

    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      fileData,
      {
        text: `You are a document summarizer for government officers in Tamil Nadu, India. Analyze this document and provide:

1. **Summary** (3-5 sentences): The main purpose and key points of the document
2. **Key Details**: Important dates, amounts, names, reference numbers
3. **Action Items**: Any required actions, deadlines, or follow-ups
4. **Category**: What type of document this is (e.g., Government Order, Circular, Letter, Invoice, Report, Notice, Form)

Rules:
- If the document is in Tamil, provide the summary in both Tamil and English
- Focus on information relevant to horticultural officers
- Be concise but don't miss important details
- Format with clear headings and bullet points
- If this is not a readable document, say so clearly`,
      },
    ]);

    const summary = result.response.text().trim();
    logContribution(session.userId, "used_ai_doc_summarizer");

    return NextResponse.json({ summary });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/ai-tools/doc-summarize", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to summarize document" }, { status: 500 });
  }
}
