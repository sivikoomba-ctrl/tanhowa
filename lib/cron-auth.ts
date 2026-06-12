import { NextRequest, NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET || "";

export function requireCronAuth(req: NextRequest): NextResponse | null {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
