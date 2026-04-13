import { NextRequest, NextResponse } from "next/server";
import { getGemini, SYSTEM_PROMPT, QUERY_TOOLS } from "@/lib/gemini";
import { executeQuery } from "@/lib/query-engine";
import { logError } from "@/lib/error-logger";
import { getSession } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter(20);
const MAX_TOOL_ROUNDS = 3; // safety cap on function-calling rounds

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!limiter.check(ip)) {
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
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: QUERY_TOOLS,
    });

    // Build conversation history
    const chatHistory = (history || []).map((msg: { role: string; text: string }) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.text }],
    }));

    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: "System instructions: " + SYSTEM_PROMPT }] },
        {
          role: "model",
          parts: [{ text: "Understood. I am TANHOWA Assistant with access to portal data via query tools. I will use them to provide accurate, live information." }],
        },
        ...chatHistory,
      ],
    });

    // Query context for user-specific functions
    const ctx = {
      userId: session.userId,
      email: session.email,
      role: session.role,
    };

    // Send user message — may trigger function calls
    let result = await chat.sendMessage(message.trim());
    let response = result.response;

    // Function calling loop: Gemini requests data → we execute → feed back
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const calls = response.functionCalls();
      if (!calls || calls.length === 0) break;

      // Execute all function calls in parallel
      const fnResponses = await Promise.all(
        calls.map(async (call) => {
          const data = await executeQuery(call.name, (call.args || {}) as Record<string, unknown>, ctx);
          return {
            functionResponse: {
              name: call.name,
              response: { result: data },
            },
          };
        })
      );

      // Feed results back to Gemini
      result = await chat.sendMessage(fnResponses);
      response = result.response;
    }

    const reply = response.text();
    return NextResponse.json({ reply });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Chat error:", msg);
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/chat",
      method: "POST",
      status_code: 500,
    });
    return NextResponse.json(
      { error: "Sorry, I'm having trouble responding. Please try again." },
      { status: 500 }
    );
  }
}
