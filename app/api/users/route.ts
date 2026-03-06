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
    .order("name", { ascending: true });

  if (status) {
    query = query.eq("status", status);
  } else if (dbRole !== "admin") {
    query = query.eq("status", "approved");
  }

  // Ensure we fetch all rows (Supabase default limit can be low)
  query = query.range(0, 9999);

  const { data: users } = await query;

  return NextResponse.json({ users: users || [] });
}
