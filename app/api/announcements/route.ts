import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isAdminOrOfficial } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { notifyNewAnnouncement } from "@/lib/mail";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");

    // Show published announcements that are either not scheduled or past their scheduled time
    let query = supabase
      .from("announcements")
      .select("*, users(name)")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    // For non-admins, filter out future scheduled announcements
    const { data: user } = await supabase.from("users").select("role").eq("id", session.userId).single();
    if (user?.role !== "admin" && user?.role !== "super_admin") {
      query = query.or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`);
    }

    const { data: announcements } = await query;

    return NextResponse.json({ announcements: announcements || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/announcements", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch announcements" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdminOrOfficial(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const title = (body.title || "").trim();
    const content = (body.content || "").trim();
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("announcements")
      .insert({
        title,
        content,
        author_id: session.userId,
        published: body.published ?? true,
        scheduled_at: body.scheduled_at || null,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/announcements", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create announcement" }, { status: 500 });
    }

    // Notify all members about the new announcement (fire-and-forget) — skip if scheduled for future
    const isScheduledFuture = data.scheduled_at && new Date(data.scheduled_at) > new Date();
    if (data.published && !isScheduledFuture) {
      notifyNewAnnouncement(data.title, data.content);
    }

    logContribution(session.userId, "announcement_created", "Created announcement: " + body.title);

    return NextResponse.json({ announcement: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/announcements", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create announcement" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdminOrOfficial(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { id, title, content } = body;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });

    const supabase = getServiceClient();
    const { error } = await supabase
      .from("announcements")
      .update({ title: title.trim(), content: (content || "").trim() })
      .eq("id", id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/announcements", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/announcements", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    await supabase.from("announcements").delete().eq("id", id);

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/announcements", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
