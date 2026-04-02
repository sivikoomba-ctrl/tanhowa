import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const { data } = await supabase
      .from("users")
      .select("name, created_at")
      .eq("status", "approved")
      .not("name", "is", null)
      .order("created_at", { ascending: false })
      .limit(15);

    const members = (data || [])
      .filter((u) => u.name?.trim())
      .map((u) => ({
        name: u.name,
        created_at: u.created_at,
      }));

    return NextResponse.json({ members });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/users/recent", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch recent members" }, { status: 500 });
  }
}
