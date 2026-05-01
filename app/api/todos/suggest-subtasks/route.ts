import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getGemini } from "@/lib/gemini";
import { createRateLimiter } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { logError } from "@/lib/error-logger";

// Ship 3a — AI Subtask Breakdown
// POST { todoId } -> { suggestions: string[] }
// Asks Gemini to propose 3-5 actionable subtasks for an existing task.
// Member then reviews/edits/picks which to insert via the existing /api/todos POST.

const limiter = createRateLimiter(10, 60000);

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ip = getRequestIp(req) || "unknown";
    if (!limiter.check(`subtask-suggest:${ip}`)) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const todoId = body?.todoId;
    if (!todoId || typeof todoId !== "string") {
      return NextResponse.json({ error: "todoId required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data: todo, error } = await supabase
      .from("todos")
      .select("id, event_id, title, description, assigned_to, committed_by, assigned_team_id, parent_id")
      .eq("id", todoId)
      .single();
    if (error || !todo) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Don't suggest sub-sub-tasks (max 2 levels of nesting).
    if (todo.parent_id) {
      return NextResponse.json({ error: "Subtasks of subtasks not supported" }, { status: 400 });
    }

    // Authorization: assignee, committer, team member, or admin
    const { data: dbUser } = await supabase.from("users").select("role").eq("id", session.userId).single();
    const isAdmin = dbUser?.role === "admin" || dbUser?.role === "super_admin";
    let canAccess = isAdmin || todo.assigned_to === session.userId || todo.committed_by === session.userId;
    if (!canAccess && todo.assigned_team_id) {
      const { data: tm } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", todo.assigned_team_id)
        .eq("user_id", session.userId)
        .maybeSingle();
      if (tm) canAccess = true;
    }
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const model = getGemini().getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `You are helping a Tamil Nadu horticultural officer break a task into smaller actionable subtasks.

Task title: ${todo.title}
${todo.description ? `Task description: ${todo.description}` : ""}

Propose 3 to 5 concrete, sequenceable subtasks that together complete the task. Each subtask should:
- Start with an imperative verb (e.g., "Visit", "Compile", "Draft", "Notify")
- Be specific and self-contained (no "etc." or vague items)
- Be doable in under a day each
- Stay focused on horticulture / member welfare context where relevant

Return STRICT JSON, no markdown, no code fences, no commentary. Format:
{"subtasks": ["...", "...", "..."]}`;

    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    let parsed: { subtasks?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "AI returned invalid format. Try again." }, { status: 502 });
    }

    const subs = Array.isArray(parsed.subtasks) ? parsed.subtasks.filter((s) => typeof s === "string" && s.trim().length > 0) : [];
    const suggestions = (subs as string[]).slice(0, 5).map((s) => s.trim());
    if (suggestions.length === 0) {
      return NextResponse.json({ error: "AI returned no usable subtasks" }, { status: 502 });
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/suggest-subtasks", method: "POST", status_code: 500, user_id: undefined });
    return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }
}
