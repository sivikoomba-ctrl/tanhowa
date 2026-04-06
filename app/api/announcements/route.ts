import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isAdminOrOfficial } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { logApiPerf } from "@/lib/api-perf";
import { logAudit } from "@/lib/audit-log";
import { notifyNewAnnouncement } from "@/lib/mail";
import { translateContent, getTranslations } from "@/lib/translate-content";
import { validate, announcementCreateSchema } from "@/lib/validation";
import { writeLimiter } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const _perfStart = Date.now();
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");

    // Admins see all (including drafts); members see only published
    const { data: user } = await supabase.from("users").select("role").eq("id", session.userId).single();
    const isAdminUser = user?.role === "admin" || user?.role === "super_admin";

    let query = supabase
      .from("announcements")
      .select("*, users(name)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!isAdminUser) {
      query = query.eq("published", true);
      query = query.or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`);
    }

    const { data: announcements } = await query;
    const items = announcements || [];

    // Merge Tamil translations if requested
    const lang = url.searchParams.get("lang");
    if (lang === "ta" && items.length > 0) {
      const ids = items.map((a: { id: string }) => a.id);
      const translations = await getTranslations("announcements", ids, "ta");
      for (const a of items) {
        const t = translations[a.id];
        if (t) {
          if (t.title) a.title = t.title;
          if (t.content) a.content = t.content;
        }
      }
    }

    logApiPerf("/api/announcements", "GET", 200, _perfStart);
    return NextResponse.json({ announcements: items });
  } catch (error) {
    logApiPerf("/api/announcements", "GET", 500, _perfStart);
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

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const body = await req.json();

    const v = validate(announcementCreateSchema, body);
    if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 });

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("announcements")
      .insert({
        title: v.data.title,
        content: v.data.content,
        author_id: session.userId,
        published: v.data.published ?? true,
        scheduled_at: v.data.scheduled_at || null,
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

    logContribution(session.userId, "announcement_created", "Created announcement: " + v.data.title);
    logAudit(session.userId, "announcement_created", "announcement", data.id);
    translateContent("announcements", data.id, { title: data.title, content: data.content });

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

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const body = await req.json();
    const { id, title, content, published, scheduled_at } = body;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title.trim();
    if (content !== undefined) updates.content = (content || "").trim();
    if (published !== undefined) updates.published = published;
    if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { error } = await supabase
      .from("announcements")
      .update(updates)
      .eq("id", id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/announcements", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    if (updates.title || updates.content) {
      // Fetch current values for translation if only one field changed
      const { data: current } = await supabase.from("announcements").select("title, content").eq("id", id).single();
      if (current) translateContent("announcements", id, { title: current.title, content: current.content });
    }

    // If just published, trigger notification broadcast
    if (published === true) {
      const { data: ann } = await supabase.from("announcements").select("title, content").eq("id", id).single();
      if (ann) {
        notifyNewAnnouncement(ann.title, ann.content);
        translateContent("announcements", id, { title: ann.title, content: ann.content });
      }
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

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!writeLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const supabase = getServiceClient();
    await supabase.from("announcements").delete().eq("id", id);
    logAudit(session.userId, "announcement_deleted", "announcement", id);

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/announcements", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
