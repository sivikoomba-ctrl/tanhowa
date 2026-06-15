import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { sendToRecipients, memberEmailsOnHold } from "@/lib/mail";
import { buildDigestContent, digestIsEmpty, renderDigestHtml, getDigestRecipients } from "@/lib/weekly-digest";

const OWNER_EMAIL = "tanhowa19791@gmail.com";

/**
 * GET — owner-only status for the digest control page: whether member emails
 * are on hold, how many members would receive the digest, and a content preview.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.email !== OWNER_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const [content, recipients] = await Promise.all([buildDigestContent(), getDigestRecipients()]);
    return NextResponse.json({
      held: memberEmailsOnHold(),
      recipientCount: recipients.length,
      isEmpty: digestIsEmpty(content),
      content,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/weekly-digest", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/**
 * POST — owner-only preview: sends the current digest to the owner only
 * (ignores HOLD), so it can be eyeballed before flipping the kill-switch.
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session || session.email !== OWNER_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const content = await buildDigestContent();
    if (digestIsEmpty(content)) {
      return NextResponse.json({ error: "Nothing to preview — no announcements or events this week." }, { status: 400 });
    }
    const { sent, failed } = await sendToRecipients(
      [session.email],
      "TANHOWA — Weekly update (PREVIEW)",
      renderDigestHtml(content),
      { ignoreHold: true }
    );
    return NextResponse.json({ ok: sent > 0, sent, failed });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/weekly-digest", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to send preview" }, { status: 500 });
  }
}
