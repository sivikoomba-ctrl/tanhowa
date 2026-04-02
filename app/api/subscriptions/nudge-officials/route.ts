import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { sendNudgeOfficialEmail } from "@/lib/mail";
import { logError } from "@/lib/error-logger";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await isAdmin(session);
    if (!admin) {
      // Also allow state officials
      const supabase = getServiceClient();
      const { data: user } = await supabase
        .from("users")
        .select("official_type")
        .eq("id", session.userId)
        .single();
      if (user?.official_type !== "state") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await req.json();
    const { district, pendingCount, totalAmount, officialIds } = body;

    if (!district || !officialIds?.length) {
      return NextResponse.json({ error: "district and officialIds required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data: officials } = await supabase
      .from("users")
      .select("id, name, email")
      .in("id", officialIds);

    if (!officials?.length) {
      return NextResponse.json({ error: "No officials found" }, { status: 404 });
    }

    // Send nudge emails to each official
    const results = await Promise.allSettled(
      officials.map((o) =>
        sendNudgeOfficialEmail(o.email, o.name || "Official", district, pendingCount || 0, totalAmount || 0)
      )
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;

    return NextResponse.json({ sent, total: officials.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/subscriptions/nudge-officials", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to send nudge" }, { status: 500 });
  }
}
