import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // "pending" | "approved" | "all"

  const supabase = getServiceClient();

  let query = supabase
    .from("documents")
    .select("*, users(name)")
    .order("created_at", { ascending: false });

  // Admin can see all, members only see approved
  if (session.role === "admin" && status) {
    if (status === "pending") query = query.eq("approved", false);
    else if (status === "approved") query = query.eq("approved", true);
  } else if (session.role !== "admin") {
    query = query.eq("approved", true);
  }

  const { data: documents } = await query;
  return NextResponse.json({ documents: documents || [] });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("documents")
    .insert({
      title: body.title,
      description: body.description || "",
      file_url: body.file_url,
      file_type: body.file_type,
      category: body.category || "",
      uploaded_by: session.userId,
      approved: session.role === "admin", // admin uploads auto-approved
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to upload document" }, { status: 500 });
  }

  return NextResponse.json({ document: data });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const supabase = getServiceClient();

  const { error } = await supabase
    .from("documents")
    .update({ approved: body.approved })
    .eq("id", body.id);

  if (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ message: "Updated" });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const supabase = getServiceClient();
  await supabase.from("documents").delete().eq("id", id);

  return NextResponse.json({ message: "Deleted" });
}
