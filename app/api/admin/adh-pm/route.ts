import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isSuperAdmin, getOfficialType } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { fetchAllRows } from "@/lib/supabase-helpers";

const ADH = "Assistant Director of Horticulture";
const ADH_PM = "Assistant Director of Horticulture (PM)";

/**
 * GET /api/admin/adh-pm — campaign tracker for the "Are you an ADH (PM)?" query.
 * Groups approved members into: now ADH(PM) (clicked Yes), said No (optout flag),
 * and no reply yet (plain ADH, no optout). Super-admin / state officials only.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await isSuperAdmin(session);
    const isState = (await getOfficialType(session.userId)) === "state";
    if (!isOwner && !isState) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();
    const rows = await fetchAllRows<{
      id: string; name: string | null; email: string; phone: string | null;
      occupation: string | null; posting_details: Record<string, string> | null;
      social_links: Record<string, unknown> | null;
    }>((from, to) =>
      supabase
        .from("users")
        .select("id, name, email, phone, occupation, posting_details, social_links")
        .eq("status", "approved")
        .range(from, to),
    );

    const map = (u: typeof rows[number]) => ({
      id: u.id,
      name: u.name || "",
      email: u.email,
      phone: u.phone || "",
      district: (u.posting_details?.regular_district as string) || "",
    });

    const nowPm: ReturnType<typeof map>[] = [];
    const saidNo: ReturnType<typeof map>[] = [];
    const noReply: ReturnType<typeof map>[] = [];

    for (const u of rows) {
      const occ = (u.occupation || "").trim();
      const optout = !!(u.social_links as { adh_pm_optout?: boolean } | null)?.adh_pm_optout;
      if (occ === ADH_PM) nowPm.push(map(u));
      else if (optout) saidNo.push(map(u));
      else if (occ === ADH) noReply.push(map(u));
    }

    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    nowPm.sort(byName); saidNo.sort(byName); noReply.sort(byName);

    return NextResponse.json({
      summary: { now_pm: nowPm.length, said_no: saidNo.length, no_reply: noReply.length },
      now_pm: nowPm,
      said_no: saidNo,
      no_reply: noReply,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/adh-pm", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
