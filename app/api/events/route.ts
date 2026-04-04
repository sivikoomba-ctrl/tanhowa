import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin, isAdminOrOfficial } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { logAudit } from "@/lib/audit-log";
import { notifyNewEvent } from "@/lib/mail";
import { translateContent, getTranslations } from "@/lib/translate-content";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");

    const { data: events } = await supabase
      .from("events")
      .select("*")
      .order("date", { ascending: true })
      .limit(limit);

    const items = events || [];
    const lang = url.searchParams.get("lang");
    if (lang === "ta" && items.length > 0) {
      const ids = items.map((e: { id: string }) => e.id);
      const translations = await getTranslations("events", ids, "ta");
      for (const e of items) {
        const t = translations[e.id];
        if (t) {
          if (t.title) e.title = t.title;
          if (t.description) e.description = t.description;
          if (t.location) e.location = t.location;
        }
      }
    }
    return NextResponse.json({ events: items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/events", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdminOrOfficial(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("events")
      .insert({
        title: body.title,
        description: body.description,
        date: body.date,
        location: body.location,
        image_url: body.image_url,
        created_by: session.userId,
      })
      .select()
      .single();

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/events", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
    }

    if (data) {
      notifyNewEvent(data.title, data.date, data.location);
      logContribution(session.userId, "event_created", "Created event: " + data.title);
      logAudit(session.userId, "event_created", "event", data.id);
      translateContent("events", data.id, { title: data.title, description: data.description || "", location: data.location || "" });
    }

    return NextResponse.json({ event: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/events", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
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
    await supabase.from("events").delete().eq("id", id);
    logAudit(session.userId, "event_deleted", "event", id);

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/events", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
