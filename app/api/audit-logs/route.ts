import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "100");

    const { data } = await supabase
      .from("audit_logs")
      .select("*, users!audit_logs_user_id_fkey(name)")
      .order("created_at", { ascending: false })
      .limit(limit);

    return NextResponse.json({ logs: data || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/audit-logs", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
  }
}
