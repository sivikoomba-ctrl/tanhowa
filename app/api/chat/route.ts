import { NextRequest, NextResponse } from "next/server";
import { getGemini, SYSTEM_PROMPT } from "@/lib/gemini";
import { logError } from "@/lib/error-logger";

// Simple rate limiting: track requests per IP
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }

  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const { message, history } = await req.json();

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Build conversation history for context
    const chatHistory = (history || []).map((msg: { role: string; text: string }) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.text }],
    }));

    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: "System instructions: " + SYSTEM_PROMPT }] },
        { role: "model", parts: [{ text: "Understood. I am TANHOWA Assistant, ready to help with horticulture and TANHOWA-related queries." }] },
        ...chatHistory,
      ],
    });

    const result = await chat.sendMessage(message.trim());
    const reply = result.response.text();

    return NextResponse.json({ reply });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Chat error:", msg);
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/chat", method: "POST", status_code: 500 });
    return NextResponse.json(
      { error: "Sorry, I'm having trouble responding. Please try again." },
      { status: 500 }
    );
  }
}
