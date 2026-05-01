import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getGemini } from "@/lib/gemini";
import { createRateLimiter } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { logError } from "@/lib/error-logger";

// Ship 3b — AI Completion Drafter
// POST { todoId } -> { draft: string }
// Reads the task, all notes, time entries, and vouchers, then asks Gemini
// to draft a 2-3 paragraph completion report. Member edits and submits.

const limiter = createRateLimiter(10, 60000);

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ip = getRequestIp(req) || "unknown";
    if (!limiter.check(`draft-report:${ip}`)) {
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
      .select("id, event_id, title, description, status, committed_by, committed_at, timebox_hours, due_date")
      .eq("id", todoId)
      .single();
    if (error || !todo) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Authorization: only the committer can draft a report (mirrors who can submit for review)
    if (todo.committed_by !== session.userId) {
      const { data: dbUser } = await supabase.from("users").select("role").eq("id", session.userId).single();
      const isAdmin = dbUser?.role === "admin" || dbUser?.role === "super_admin";
      if (!isAdmin) {
        return NextResponse.json({ error: "Only the committer can draft the completion report" }, { status: 403 });
      }
    }

    // Pull surrounding context in parallel
    const [notesRes, hoursRes, vouchersRes] = await Promise.all([
      supabase
        .from("todo_notes")
        .select("type, content, created_at")
        .eq("todo_id", todoId)
        .order("created_at", { ascending: true })
        .limit(50),
      supabase
        .from("todo_time_entries")
        .select("hours, description, logged_at")
        .eq("todo_id", todoId)
        .order("logged_at", { ascending: true })
        .limit(50),
      supabase
        .from("todo_vouchers")
        .select("title, amount, status")
        .eq("todo_id", todoId)
        .limit(20),
    ]);

    const notes = notesRes.data || [];
    const hours = hoursRes.data || [];
    const vouchers = vouchersRes.data || [];
    const totalHours = hours.reduce((s, h) => s + Number(h.hours || 0), 0);
    const totalSpend = vouchers
      .filter((v) => v.status === "approved")
      .reduce((s, v) => s + Number(v.amount || 0), 0);

    const notesBlock = notes.length === 0
      ? "(No notes recorded)"
      : notes.map((n) => `- [${n.type}] ${n.content}`).join("\n");
    const hoursBlock = hours.length === 0
      ? "(No time entries)"
      : `Logged ${totalHours.toFixed(1)}h across ${hours.length} entries${hours.some((h) => h.description) ? "; entries with descriptions: " + hours.filter((h) => h.description).map((h) => `${h.hours}h — ${h.description}`).join("; ") : ""}`;
    const vouchersBlock = vouchers.length === 0
      ? "(No vouchers)"
      : vouchers.map((v) => `${v.title}: ₹${v.amount} (${v.status})`).join("; ") + (totalSpend > 0 ? ` — total approved spend: ₹${totalSpend}` : "");

    const model = getGemini().getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `You are helping a Tamil Nadu horticultural officer write a brief completion report for a finished task.

Task: ${todo.event_id} — ${todo.title}
${todo.description ? `Original brief: ${todo.description}` : ""}
${todo.timebox_hours ? `Timebox: ${todo.timebox_hours}h` : ""}
${todo.due_date ? `Due date was: ${todo.due_date}` : ""}

Activity notes:
${notesBlock}

Time logged:
${hoursBlock}

Vouchers/expenses:
${vouchersBlock}

Write a 2-3 paragraph completion report (max ~150 words) for the admin reviewer. Focus on:
1. What was actually done (synthesize from the notes)
2. Time and cost summary if relevant
3. Any blockers encountered or follow-ups recommended

Plain text only. No markdown, no headings, no emojis. Write in first person ("I visited...", "I drafted..."). Tone: professional, factual, concise. If the notes are sparse, say so honestly rather than inventing detail.`;

    const result = await model.generateContent(prompt);
    const draft = result.response.text().trim();

    if (!draft || draft.length < 20) {
      return NextResponse.json({ error: "AI returned an empty draft. Try again." }, { status: 502 });
    }

    return NextResponse.json({ draft });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/todos/draft-report", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to generate draft" }, { status: 500 });
  }
}
