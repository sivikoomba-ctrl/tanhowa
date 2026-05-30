import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

const PUBLIC_SETTINGS_KEYS = new Set(["payment_qr_url", "payment_upi_id", "community_name", "tagline", "about"]);

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const admin = await isAdmin(session);
    let query = supabase.from("site_settings").select("key, value");
    if (!admin) {
      query = query.in("key", Array.from(PUBLIC_SETTINGS_KEYS));
    }
    const { data: rows } = await query;

    const settings: Record<string, string> = {};
    rows?.forEach((r) => {
      settings[r.key] = r.value || "";
    });

    return NextResponse.json({ settings });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/settings", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const supabase = getServiceClient();

    const ALLOWED_SETTINGS_KEYS = new Set([
      "payment_qr_url", "payment_upi_id", "community_name", "tagline", "about",
      "bank_name", "bank_account", "bank_ifsc", "bank_branch",
      "razorpay_enabled", "online_payment_enabled",
      "announcement_auto_translate", "email_notifications_enabled",
    ]);

    const entries = Object.entries(body) as [string, string][];
    for (const [key, value] of entries) {
      if (!ALLOWED_SETTINGS_KEYS.has(key)) {
        return NextResponse.json({ error: `Setting key "${key}" is not allowed` }, { status: 400 });
      }
      await supabase
        .from("site_settings")
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    }

    return NextResponse.json({ message: "Settings updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/settings", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
