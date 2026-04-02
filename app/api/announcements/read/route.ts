import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

// GET: fetch read counts per announcement (admin) or list of read IDs (member)
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const admin = await isAdmin(session);

    if (admin && url.searchParams.get("counts") === "true") {
      // Admin: get read counts per announcement
      const { data } = await supabase
        .from("announcement_reads")
        .select("announcement_id");

      const counts: Record<string, number> = {};
      for (const row of data || []) {
        counts[row.announcement_id] = (counts[row.announcement_id] || 0) + 1;
      }
      return NextResponse.json({ counts });
    }

    // Member: get list of announcement IDs they've read
    const { data } = await supabase
      .from("announcement_reads")
      .select("announcement_id")
      .eq("user_id", session.userId);

    return NextResponse.json({ readIds: (data || []).map((r) => r.announcement_id) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/announcements/read", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch announcement read status" }, { status: 500 });
  }
}

// POST: mark announcement as read
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { announcement_id } = await req.json();
    if (!announcement_id) return NextResponse.json({ error: "announcement_id required" }, { status: 400 });

    const supabase = getServiceClient();
    await supabase
      .from("announcement_reads")
      .upsert(
        { announcement_id, user_id: session.userId, read_at: new Date().toISOString() },
        { onConflict: "announcement_id,user_id" }
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/announcements/read", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to mark announcement as read" }, { status: 500 });
  }
}
