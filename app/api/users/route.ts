import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, getDbRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
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
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  } else if (dbRole !== "admin") {
    query = query.eq("status", "approved");
  }

  const { data: users, error } = await query;

  if (error) {
    console.error("Users query error:", error.message, { status, dbRole, userId: session.userId });
  }

  return NextResponse.json({ users: users || [], debug: { count: users?.length ?? 0, status, dbRole, error: error?.message } });
}
