import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getDbRole } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const dbRole = await getDbRole(session.userId);

    let query = supabase
      .from("users")
      .select("*")
      .order("name", { ascending: true });

    if (status) {
      query = query.eq("status", status);
    } else if (dbRole !== "admin" && dbRole !== "super_admin") {
      query = query.eq("status", "approved");
    }

    // Ensure we fetch all rows (Supabase default limit can be low)
    query = query.range(0, 9999);

    const { data: users } = await query;

    return NextResponse.json({ users: users || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/users", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
