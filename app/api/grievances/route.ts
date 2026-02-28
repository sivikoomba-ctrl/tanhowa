import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const supabase = getServiceClient();

  let query = supabase
    .from("grievances")
    .select("*, users(name)")
    .order("created_at", { ascending: false });

  if (session.role === "admin") {
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
  } else {
    query = query.eq("submitted_by", session.userId);
  }

  const { data: grievances } = await query;
  return NextResponse.json({ grievances: grievances || [] });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.subject || !body.description) {
    return NextResponse.json({ error: "Subject and description are required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("grievances")
    .insert({
      subject: body.subject,
      description: body.description,
      category: body.category || "",
      submitted_by: session.userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to submit grievance" }, { status: 500 });
  }

  return NextResponse.json({ grievance: data });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const supabase = getServiceClient();

  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (body.status) updates.status = body.status;
  if (body.admin_remarks !== undefined) updates.admin_remarks = body.admin_remarks;

  const { error } = await supabase
    .from("grievances")
    .update(updates)
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
  await supabase.from("grievances").delete().eq("id", id);

  return NextResponse.json({ message: "Deleted" });
}
