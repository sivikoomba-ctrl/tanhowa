import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { getGemini } from "@/lib/gemini";
import { logError } from "@/lib/error-logger";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const imageUrl = formData.get("image_url") as string | null;

    let imageData: { inlineData: { data: string; mimeType: string } } | null = null;

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      imageData = {
        inlineData: {
          data: buffer.toString("base64"),
          mimeType: file.type,
        },
      };
    } else if (imageUrl) {
      // Fetch the signed URL image
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        return NextResponse.json({ error: "Failed to fetch image" }, { status: 400 });
      }
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      imageData = {
        inlineData: {
          data: buffer.toString("base64"),
          mimeType: contentType,
        },
      };
    }

    if (!imageData) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      imageData,
      {
        text: `Analyze this payment proof/receipt image. Extract the exact payment date and time.

Return ONLY a JSON object in this exact format, nothing else:
{"date": "YYYY-MM-DD", "time": "HH:MM"}

Rules:
- Use 24-hour time format
- If you cannot determine the date, use null for "date"
- If you cannot determine the time, use null for "time"
- Do not include any explanation, just the JSON object`,
      },
    ]);

    const text = result.response.text().trim();
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return NextResponse.json({ date: null, time: null });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      date: parsed.date || null,
      time: parsed.time || null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/upload/payment-proof/extract-date",
      method: "POST",
      status_code: 500,
    });
    return NextResponse.json({ date: null, time: null });
  }
}
