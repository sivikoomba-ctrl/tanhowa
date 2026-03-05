import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

// POST: Client-side error submission (no auth required)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    await supabase.from("error_logs").insert({
      type: "client",
      message: body.message,
      stack: body.stack || "",
      path: body.path || "",
      method: "",
      status_code: 0,
      user_id: null,
      metadata: body.metadata || {},
      status: "unresolved",
    });

    return NextResponse.json({ message: "Logged" });
  } catch {
    return NextResponse.json({ error: "Failed to log" }, { status: 500 });
  }
}

// GET: Admin fetches error logs
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 50;
  const offset = (page - 1) * limit;

  const supabase = getServiceClient();

  let query = supabase
    .from("error_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (type === "unresolved") {
    query = query.eq("status", "unresolved");
  } else if (type && type !== "all") {
    query = query.eq("type", type);
  }

  const [{ data: logs, count }, unresolvedRes] = await Promise.all([
    query,
    supabase.from("error_logs").select("id", { count: "exact", head: true }).eq("status", "unresolved"),
  ]);

  return NextResponse.json({
    logs: logs || [],
    total: count || 0,
    unresolvedCount: unresolvedRes.count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  });
}

// PUT: Mark error(s) as resolved
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, status } = await req.json();
  const supabase = getServiceClient();

  if (id === "all") {
    await supabase.from("error_logs")
      .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null })
      .eq("status", "unresolved");
  } else if (id) {
    await supabase.from("error_logs")
      .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null })
      .eq("id", id);
  }

  return NextResponse.json({ message: "Updated" });
}

// DELETE: Admin clears logs
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  const supabase = getServiceClient();

  if (id === "all") {
    await supabase.from("error_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  } else if (id) {
    await supabase.from("error_logs").delete().eq("id", id);
  }

  return NextResponse.json({ message: "Deleted" });
}
