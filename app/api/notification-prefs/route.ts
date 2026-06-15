import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

const DEFAULT_PREFS = { email: true, telegram: true, in_app: true, weekly_digest: true, whatsapp: false };

/**
 * GET /api/notification-prefs — Get current user's notification preferences
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const { data } = await supabase
      .from("users")
      .select("notification_prefs")
      .eq("id", session.userId)
      .single();

    return NextResponse.json({ prefs: data?.notification_prefs || DEFAULT_PREFS });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/notification-prefs", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

/**
 * PUT /api/notification-prefs — Update notification preferences
 * Body: { email?: boolean, telegram?: boolean, in_app?: boolean }
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const prefs = {
      email: body.email !== undefined ? !!body.email : true,
      telegram: body.telegram !== undefined ? !!body.telegram : true,
      in_app: body.in_app !== undefined ? !!body.in_app : true,
      weekly_digest: body.weekly_digest !== undefined ? !!body.weekly_digest : true,
      whatsapp: body.whatsapp !== undefined ? !!body.whatsapp : false,
    };

    const supabase = getServiceClient();
    await supabase
      .from("users")
      .update({ notification_prefs: prefs })
      .eq("id", session.userId);

    return NextResponse.json({ ok: true, prefs });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/notification-prefs", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
