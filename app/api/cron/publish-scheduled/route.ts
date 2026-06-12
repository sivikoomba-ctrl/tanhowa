import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { notifyNewAnnouncement } from "@/lib/mail";
import { requireCronAuth } from "@/lib/cron-auth";

export async function GET(req: NextRequest) {
  try {
    const unauthorized = requireCronAuth(req);
    if (unauthorized) return unauthorized;

    const supabase = getServiceClient();
    const now = new Date().toISOString();

    // Publish scheduled announcements
    const { data: announcements } = await supabase
      .from("announcements")
      .select("id, title, content")
      .eq("published", false)
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", now);

    let publishedCount = 0;
    for (const a of announcements || []) {
      await supabase.from("announcements").update({ published: true, scheduled_at: null }).eq("id", a.id);
      notifyNewAnnouncement(a.title, a.content);
      publishedCount++;
    }

    // Publish scheduled events (if they have a published/visible flag)
    // Events don't have a published flag, so scheduled_at just means "visible after this time"
    // We'll clear the scheduled_at to indicate it's now visible

    return NextResponse.json({ ok: true, published: publishedCount });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
