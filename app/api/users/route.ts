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

  const fullSelect = "id, name, email, phone, occupation, address, dob, posting_details, social_links, photo_url, role, status, login_count, last_login_at, created_at";
  const baseSelect = "id, name, email, phone, occupation, address, dob, posting_details, social_links, photo_url, role, status, created_at";

  let query = supabase
    .from("users")
    .select(fullSelect)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  } else if (session.role !== "admin") {
    query = query.eq("status", "approved");
  }

  let { data: users, error } = await query;

  // Fallback if login_count/last_login_at columns don't exist yet
  if (error) {
    let fallback = supabase
      .from("users")
      .select(baseSelect)
      .order("created_at", { ascending: false });

    if (status) {
      fallback = fallback.eq("status", status);
    } else if (session.role !== "admin") {
      fallback = fallback.eq("status", "approved");
    }

    const result = await fallback;
    users = result.data;
  }

  return NextResponse.json({ users: users || [] });
}
