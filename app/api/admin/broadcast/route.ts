import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isAdmin } from "@/lib/auth";
import { sendBroadcastEmail } from "@/lib/mail";
import { logAudit } from "@/lib/audit-log";
import { logError } from "@/lib/error-logger";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { subject, body, district } = await req.json();
    if (!subject?.trim() || !body?.trim()) {
      return NextResponse.json({ error: "Subject and body required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Get recipients
    let query = supabase.from("users").select("email, name").eq("status", "approved");
    if (district && district !== "all") {
      query = query.eq("posting_details->>regular_district", district);
    }
    const { data: recipients } = await query;

    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ error: "No recipients found" }, { status: 404 });
    }

    // Send via broadcast (BCC batched)
    await sendBroadcastEmail(subject.trim(), body.trim());

    logAudit(session.userId, "broadcast_email", "email", undefined, {
      subject,
      recipientCount: recipients.length,
      district: district || "all",
    });

    return NextResponse.json({ sent: recipients.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/admin/broadcast", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to send broadcast" }, { status: 500 });
  }
}
