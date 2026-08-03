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

    const { message, history, image } = await req.json();

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Optional image attachment (member taps 📎 → "Show the assistant"). Gemini
    // 2.5-flash is multimodal, so we forward it as an inlineData part.
    const hasImage =
      image && typeof image.data === "string" &&
      typeof image.mimeType === "string" && image.mimeType.startsWith("image/") &&
      image.data.length < 8_000_000; // ~6MB raw

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
    const userParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
      { text: message.trim() },
    ];
    if (hasImage) {
      userParts.push({ inlineData: { data: image.data, mimeType: image.mimeType } });
    }
    let result = await chat.sendMessage(userParts);
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

    let reply = "";
    try {
      reply = response.text();
    } catch {
      reply = "";
    }

    // Gemini sometimes ends the tool-calling loop without any final text part
    // (e.g. it still wants another function call after MAX_TOOL_ROUNDS, or an
    // occasional empty/blocked candidate) — response.text() then silently
    // returns "" rather than throwing, which used to reach the member as a
    // blank 200 OK and show the generic "Sorry, something went wrong."
    // Ask once more for a plain-text summary before giving up.
    if (!reply) {
      try {
        const followUp = await chat.sendMessage(
          "Please give a plain-text summary of the information you have for the user now, without calling any more functions."
        );
        reply = followUp.response.text();
      } catch {
        reply = "";
      }
    }

    if (!reply) {
      await logError({
        type: "api",
        message: "Gemini returned an empty reply after the tool-calling loop",
        path: "/api/chat",
        method: "POST",
        status_code: 200,
        user_id: session.userId,
        metadata: { message: message.trim().slice(0, 200) },
      });
      reply = "Sorry, I couldn't put together an answer for that. Could you try rephrasing your question?";
    }

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
