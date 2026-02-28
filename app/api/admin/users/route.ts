import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { userId, action, role } = body;

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  if (action === "approve") {
    await supabase.from("users").update({ status: "approved" }).eq("id", userId);
  } else if (action === "reject") {
    await supabase.from("users").update({ status: "rejected" }).eq("id", userId);
  } else if (action === "set-role" && role) {
    await supabase.from("users").update({ role }).eq("id", userId);
  }

  return NextResponse.json({ message: "User updated" });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  // Prevent self-deletion
  if (userId === session.userId) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  const supabase = getServiceClient();
  await supabase.from("users").delete().eq("id", userId);

  return NextResponse.json({ message: "User deleted" });
}
