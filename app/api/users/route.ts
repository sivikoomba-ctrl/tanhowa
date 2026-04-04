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

    const isAdmin = dbRole === "admin" || dbRole === "super_admin";
    const page = parseInt(url.searchParams.get("page") || "1");
    // Admin loads all users for client-side filtering/counts; members get paginated
    const limit = parseInt(url.searchParams.get("limit") || (isAdmin ? "10000" : "100"));
    const search = url.searchParams.get("search") || "";
    const offset = (page - 1) * limit;

    const selectClause = isAdmin
      ? "*"
      : "id, name, email, occupation, phone, photo_url, role, official_type, posting_details, social_links, created_at, last_active_at";

    let query = supabase
      .from("users")
      .select(selectClause, { count: "exact" })
      .order("name", { ascending: true });

    if (status) {
      query = query.eq("status", status);
    } else if (dbRole !== "admin" && dbRole !== "super_admin") {
      query = query.eq("status", "approved");
    }

    // Hide test account from regular member views
    if (!isAdmin) {
      query = query.neq("email", "tanhowa19791@gmail.com");
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: users, count } = await query;

    return NextResponse.json({
      users: users || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/users", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
