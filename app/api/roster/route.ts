import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit-log";
import { logError } from "@/lib/error-logger";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const supabase = getServiceClient();
    const { data } = await supabase
      .from("roster_entries")
      .select("id, name, designation, district, block, phone, email, created_at")
      .order("district", { ascending: true })
      .order("created_at", { ascending: true });
    return NextResponse.json({ entries: data || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/roster", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load roster" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const district = typeof body.district === "string" ? body.district.trim() : "";
    if (!name || !district) {
      return NextResponse.json({ error: "Name and district are required" }, { status: 400 });
    }
    const row = {
      name,
      district,
      designation: typeof body.designation === "string" ? body.designation.trim() || null : null,
      block: typeof body.block === "string" ? body.block.trim() || null : null,
      phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
      email: typeof body.email === "string" ? body.email.trim().toLowerCase() || null : null,
      added_by: session.userId,
    };
    const supabase = getServiceClient();
    const { data, error } = await supabase.from("roster_entries").insert(row).select().single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    logAudit(session.userId, "roster_add", "roster_entry", data?.id, { name, district });
    return NextResponse.json({ entry: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/roster", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to add roster entry" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const supabase = getServiceClient();
    await supabase.from("roster_entries").delete().eq("id", id);
    logAudit(session.userId, "roster_delete", "roster_entry", id, {});
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/roster", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
