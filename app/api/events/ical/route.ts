import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

function escapeIcal(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function formatIcalDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "all"; // all, events, trainings
    const id = url.searchParams.get("id"); // single event/training

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//TANHOWA//Member Portal//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:TANHOWA Events",
    ];

    if (type === "all" || type === "events") {
      let query = supabase.from("events").select("id, title, description, date, location");
      if (id) query = query.eq("id", id);
      const { data: events } = await query.order("date", { ascending: false }).limit(100);

      for (const e of events || []) {
        const endDate = new Date(new Date(e.date).getTime() + 2 * 60 * 60 * 1000); // +2 hours default
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:event-${e.id}@tanhowa.in`);
        lines.push(`DTSTART:${formatIcalDate(e.date)}`);
        lines.push(`DTEND:${formatIcalDate(endDate.toISOString())}`);
        lines.push(`SUMMARY:${escapeIcal(e.title)}`);
        if (e.description) lines.push(`DESCRIPTION:${escapeIcal(e.description)}`);
        if (e.location) lines.push(`LOCATION:${escapeIcal(e.location)}`);
        lines.push(`URL:https://www.tanhowa.in/dashboard/events`);
        lines.push("END:VEVENT");
      }
    }

    if (type === "all" || type === "trainings") {
      let query = supabase.from("trainings").select("id, title, date, mode, trainer_name, duration_hours, meeting_link");
      if (id && type === "trainings") query = query.eq("id", id);
      const { data: trainings } = await query.order("date", { ascending: false }).limit(100);

      for (const t of trainings || []) {
        const durationMs = (t.duration_hours || 3) * 60 * 60 * 1000;
        const endDate = new Date(new Date(t.date).getTime() + durationMs);
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:training-${t.id}@tanhowa.in`);
        lines.push(`DTSTART:${formatIcalDate(t.date)}`);
        lines.push(`DTEND:${formatIcalDate(endDate.toISOString())}`);
        lines.push(`SUMMARY:[Training] ${escapeIcal(t.title)}`);
        lines.push(`DESCRIPTION:${escapeIcal(`Trainer: ${t.trainer_name || "TBA"}\\nMode: ${t.mode || "offline"}${t.duration_hours ? `\\nDuration: ${t.duration_hours}h` : ""}`)}`);
        if (t.meeting_link) lines.push(`URL:${t.meeting_link}`);
        lines.push("END:VEVENT");
      }
    }

    lines.push("END:VCALENDAR");

    return new NextResponse(lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="tanhowa-${type}.ics"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to generate calendar" }, { status: 500 });
  }
}
