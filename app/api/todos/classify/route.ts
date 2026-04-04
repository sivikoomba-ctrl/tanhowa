import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logAudit } from "@/lib/audit-log";
import { getGemini } from "@/lib/gemini";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter(10, 60000); // 10 requests per minute

const BATCH_SIZE = 20;

function buildClassificationPrompt(
  teams: { id: string; name: string; description: string }[],
  tasks: { id: string; title: string; description: string }[]
): string {
  const teamList = teams
    .map((t, i) => `${i + 1}. "${t.name}" (id: ${t.id})${t.description ? ` — ${t.description}` : ""}`)
    .join("\n");

  const taskList = JSON.stringify(
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description?.slice(0, 200) || "",
    })),
    null,
    2
  );

  return `You are a task classifier for TANHOWA (Tamil Nadu Horticultural Officers Welfare Association).

Available teams:
${teamList}

Classification guidelines:
- Finance Team: payment, subscription, dues, expense, voucher, ledger, bank, reconciliation, amount, receipt, invoice
- IT Team: portal, website, app, tech, bug, feature, development, system, server, deploy, AI tool, database
- Legal Team (Chennai/Madurai): legal, court, case, UATT, bench, advocate, petition, judgment, hearing
- Membership Registration Team: member, registration, onboard, profile, approval, sign up, directory, pending users
- Task Management (TM) Team: coordination, oversight, progress, reporting, task tracking, team management
- For any other team the admin has created, use the team name and description as context

Rules:
- Assign each task to the BEST matching team based on title and description
- If a task mentions a specific city (Chennai, Madurai) for legal matters, assign to the corresponding Legal Team
- If no team fits well (confidence < 0.5), set team_id to null
- Return confidence as 0.0 to 1.0 (1.0 = perfect match, 0.5 = borderline)

Tasks to classify:
${taskList}

Return ONLY a JSON array with this exact format (no markdown, no explanation):
[{"id": "task-uuid", "team_id": "team-uuid-or-null", "team_name": "Team Name or null", "confidence": 0.85, "reason": "brief 3-5 word reason"}]`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!limiter.check(ip)) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
    }

    const body = await req.json();
    const action = body.action; // "suggest" or "bulk"

    const supabase = getServiceClient();

    // Fetch all teams
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name, description")
      .order("sort_order", { ascending: true });

    if (!teams || teams.length === 0) {
      return NextResponse.json({ error: "No teams found. Create teams first." }, { status: 400 });
    }

    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    if (action === "suggest") {
      // Single task suggestion — no DB write
      const title = (body.title || "").trim();
      const description = (body.description || "").trim();
      if (!title) {
        return NextResponse.json({ error: "Title is required" }, { status: 400 });
      }

      const prompt = buildClassificationPrompt(
        teams.map((t) => ({ id: t.id, name: t.name, description: t.description || "" })),
        [{ id: "suggest", title, description }]
      );

      const response = await model.generateContent(prompt);
      const text = (response.response.text() || "").trim();
      const parsed = parseGeminiResponse(text);

      if (parsed.length === 0) {
        return NextResponse.json({ suggestion: null, message: "Could not classify this task" });
      }

      const result = parsed[0];
      const team = teams.find((t) => t.id === result.team_id);

      return NextResponse.json({
        suggestion: result.team_id
          ? { team_id: result.team_id, team_name: team?.name || result.team_name, confidence: result.confidence, reason: result.reason }
          : null,
      });
    }

    if (action === "bulk") {
      // Bulk classify unassigned tasks
      const { data: unassigned } = await supabase
        .from("todos")
        .select("id, title, description")
        .is("assigned_team_id", null)
        .is("assigned_to", null)
        .not("status", "in", '("completed","rejected","cancelled")');

      if (!unassigned || unassigned.length === 0) {
        return NextResponse.json({ message: "No unassigned tasks found", classified: 0, skipped: 0 });
      }

      const teamData = teams.map((t) => ({ id: t.id, name: t.name, description: t.description || "" }));
      let classified = 0;
      let skipped = 0;
      const results: { id: string; team_name: string; confidence: number; reason: string }[] = [];

      // Process in batches
      for (let i = 0; i < unassigned.length; i += BATCH_SIZE) {
        const batch = unassigned.slice(i, i + BATCH_SIZE);
        const prompt = buildClassificationPrompt(teamData, batch);

        try {
          const response = await model.generateContent(prompt);
          const text = (response.response.text() || "").trim();
          const parsed = parseGeminiResponse(text);

          for (const item of parsed) {
            if (item.team_id && item.confidence >= 0.7) {
              // Update task with team assignment
              await supabase
                .from("todos")
                .update({ assigned_team_id: item.team_id, updated_at: new Date().toISOString() })
                .eq("id", item.id);
              classified++;
              results.push({ id: item.id, team_name: item.team_name || "", confidence: item.confidence, reason: item.reason || "" });
            } else {
              skipped++;
            }
          }
        } catch (e) {
          await logError({
            type: "api",
            message: `Batch classification failed: ${e instanceof Error ? e.message : String(e)}`,
            path: "/api/todos/classify",
            method: "POST",
            status_code: 500,
          });
          skipped += batch.length;
        }

        // Delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < unassigned.length) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }

      logAudit(session.userId, "bulk_classify_tasks", "todo", "", {
        classified,
        skipped,
        total: unassigned.length,
      });

      return NextResponse.json({
        message: `Classified ${classified} tasks, skipped ${skipped}`,
        classified,
        skipped,
        total: unassigned.length,
        results,
      });
    }

    return NextResponse.json({ error: "Invalid action. Use 'suggest' or 'bulk'." }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({
      type: "api",
      message: msg,
      stack: error instanceof Error ? error.stack : "",
      path: "/api/todos/classify",
      method: "POST",
      status_code: 500,
    });
    return NextResponse.json({ error: "Classification failed" }, { status: 500 });
  }
}

function parseGeminiResponse(text: string): { id: string; team_id: string | null; team_name: string; confidence: number; reason: string }[] {
  let cleaned = text;
  // Strip markdown code blocks
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        id: item.id || "",
        team_id: item.team_id || null,
        team_name: item.team_name || "",
        confidence: typeof item.confidence === "number" ? item.confidence : 0,
        reason: item.reason || "",
      }));
    }
  } catch {
    // Try to extract JSON array from response
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        return arr.map((item: Record<string, unknown>) => ({
          id: (item.id as string) || "",
          team_id: (item.team_id as string) || null,
          team_name: (item.team_name as string) || "",
          confidence: typeof item.confidence === "number" ? item.confidence : 0,
          reason: (item.reason as string) || "",
        }));
      } catch { /* fall through */ }
    }
  }
  return [];
}
