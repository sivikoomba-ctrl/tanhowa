import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  let query = supabase
    .from("users")
    .select("id, name, email, phone, occupation, address, dob, posting_details, social_links, photo_url, role, status, login_count, last_login_at, created_at")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  } else if (session.role !== "admin") {
    query = query.eq("status", "approved");
  }

  const { data: users } = await query;

  return NextResponse.json({ users: users || [] });
}
