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
        text: `You are an expense document parser. Extract structured expense information from this receipt/invoice/bill image.

Return a JSON object with exactly these fields:
{
  "vendor_name": "store/vendor name",
  "date": "DD/MM/YYYY or null if not found",
  "total_amount": number or null,
  "items": [{ "description": "item name", "quantity": number or null, "amount": number or null }],
  "tax": number or null (GST/VAT amount),
  "payment_method": "Cash/Card/UPI/etc or null",
  "invoice_number": "invoice/bill number or null",
  "category": "one of: Travel, Food, Stationery, Printing, Communication, Transport, Miscellaneous",
  "notes": "any additional relevant info or null"
}

Rules:
- Extract ALL line items if visible
- Amounts should be numbers (not strings), in Indian Rupees
- If Tamil text, still extract the details
- If something is not visible or unclear, use null
- Return ONLY the JSON object, no explanations
- If this is not a receipt/invoice, return: { "vendor_name": "Not a receipt", "date": null, "total_amount": null, "items": [], "tax": null, "payment_method": null, "invoice_number": null, "category": null, "notes": "This image does not appear to be a receipt or invoice." }`,
      },
    ]);

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse expense details" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    logContribution(session.userId, "used_ai_expense_ocr");

    return NextResponse.json(parsed);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/ai-tools/expense-ocr", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to extract expense details" }, { status: 500 });
  }
}
