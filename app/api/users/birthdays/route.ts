import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    const { data } = await supabase
      .from("users")
      .select("name, dob, photo_url")
      .eq("status", "approved")
      .not("dob", "is", null);

    if (!data || data.length === 0) return NextResponse.json({ birthdays: [] });

    const now = new Date();
    const today = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // Find birthdays in next 7 days (including today)
    const upcoming: { name: string; dob: string; photo_url: string | null; isToday: boolean; daysUntil: number }[] = [];

    for (const u of data) {
      if (!u.dob) continue;
      const [, month, day] = u.dob.split("-");
      const mmdd = `${month}-${day}`;

      // Calculate days until birthday
      const thisYearBday = new Date(now.getFullYear(), parseInt(month) - 1, parseInt(day));
      if (thisYearBday < now) thisYearBday.setFullYear(now.getFullYear() + 1);
      const daysUntil = Math.ceil((thisYearBday.getTime() - now.getTime()) / 86400000);

      if (daysUntil <= 7 || mmdd === today) {
        upcoming.push({
          name: u.name,
          dob: u.dob,
          photo_url: u.photo_url,
          isToday: mmdd === today,
          daysUntil: mmdd === today ? 0 : daysUntil,
        });
      }
    }

    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

    return NextResponse.json({ birthdays: upcoming });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/users/birthdays", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch birthdays" }, { status: 500 });
  }
}
