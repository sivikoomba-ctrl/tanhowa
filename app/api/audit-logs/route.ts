import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
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
}
