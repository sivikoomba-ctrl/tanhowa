import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdmin, isFinanceTeamMember } from "@/lib/auth";
import { getGemini } from "@/lib/gemini";
import { logError } from "@/lib/error-logger";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter(10);

// POST /api/finance/scan — extract cheque entries from a cheque-book
// counterfoil / register page image (bulk entry via AI OCR)
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !((await isSuperAdmin(session)) || (await isFinanceTeamMember(session.userId)))) {
      return NextResponse.json({ error: "Finance team access required" }, { status: 403 });
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
        text: `You are a bank cheque register parser. This image is a page from a cheque book — counterfoils (cheque leaf stubs), a cheque issue register, or a handwritten/printed list of cheques issued.

Extract EVERY cheque entry visible on the page. Return a JSON object with exactly this shape:
{
  "entries": [
    {
      "entry_date": "YYYY-MM-DD or null if not readable",
      "cheque_no": "cheque number as a string, or null",
      "payee": "who the cheque is made out to, or null",
      "amount": number or null,
      "remarks": "purpose/notes if written, or null"
    }
  ]
}

Rules:
- One object per cheque, in the order they appear on the page
- Amounts are numbers in Indian Rupees (no commas, no currency symbols)
- Dates in handwriting may be DD/MM/YYYY or DD-MM-YY — convert to YYYY-MM-DD (Indian date order: day first)
- Handwriting and Tamil text should still be read; do your best
- Skip cancelled/void stubs only if clearly struck out — otherwise include with remarks "possibly cancelled"
- If a field is unreadable, use null — do NOT guess values
- Return ONLY the JSON object, no explanations
- If the image contains no cheque information at all, return: { "entries": [] }`,
      },
    ]);

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not read cheque details from the image" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];

    return NextResponse.json({
      entries: entries.map((e: Record<string, unknown>) => ({
        entry_date: typeof e.entry_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.entry_date) ? e.entry_date : "",
        cheque_no: typeof e.cheque_no === "string" || typeof e.cheque_no === "number" ? String(e.cheque_no) : "",
        payee: typeof e.payee === "string" ? e.payee : "",
        amount: typeof e.amount === "number" && e.amount > 0 ? e.amount : null,
        remarks: typeof e.remarks === "string" ? e.remarks : "",
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/finance/scan", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to scan cheque page" }, { status: 500 });
  }
}
