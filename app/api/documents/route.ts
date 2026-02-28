import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  const { data: documents } = await supabase
    .from("documents")
    .select("*, users(name)")
    .order("created_at", { ascending: false });

  return NextResponse.json({ documents: documents || [] });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("documents")
    .insert({
      title: body.title,
      file_url: body.file_url,
      file_type: body.file_type,
      uploaded_by: session.userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to upload document" }, { status: 500 });
  }

  return NextResponse.json({ document: data });
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
