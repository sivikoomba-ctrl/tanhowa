import { NextRequest, NextResponse } from "next/server";
import { triggerDailyGreetings } from "@/lib/daily-greetings";
import { logError } from "@/lib/error-logger";

// Vercel Cron runs this daily at 7:00 AM IST (1:30 AM UTC)
// vercel.json: "crons": [{ "path": "/api/cron/daily-greetings", "schedule": "30 1 * * *" }]
// Both this cron and the fire-and-forget call from /api/users/me GET delegate
// to triggerDailyGreetings(), which uses an atomic dated-key claim so only the
// first caller of the day actually does the work.

const CRON_SECRET = process.env.CRON_SECRET || "";

export async function GET(req: NextRequest) {
  try {
    if (!CRON_SECRET) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await triggerDailyGreetings();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/cron/daily-greetings", method: "GET", status_code: 500 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
