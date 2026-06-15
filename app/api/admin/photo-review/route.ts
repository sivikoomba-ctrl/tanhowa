import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isSuperAdmin, getOfficialType, type SessionPayload } from "@/lib/auth";
import { logAudit } from "@/lib/audit-log";
import { logError } from "@/lib/error-logger";
import { sendPhotoRejectionEmail } from "@/lib/mail";

// Access: super_admin or state officials only (matches the lock authority).
async function hasPhotoReviewAccess(session: SessionPayload) {
  if (await isSuperAdmin(session)) return true;
  return (await getOfficialType(session.userId)) === "state";
}

const VALID_STATUS = ["pending", "approved", "rejected", "all"];

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPhotoReviewAccess(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "pending";
    const filter = VALID_STATUS.includes(status) ? status : "pending";

    const supabase = getServiceClient();
    let query = supabase
      .from("users")
      .select(
        "id, name, email, photo_url, occupation, posting_details, status, photo_status, photo_locked, photo_reviewed_at, photo_review_note, photo_quality, reviewer:photo_reviewed_by(name)"
      )
      .not("photo_url", "is", null)
      .eq("status", "approved")
      .limit(2000);

    if (filter !== "all") query = query.eq("photo_status", filter);

    const { data, error } = await query;
    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/admin/photo-review", method: "GET", status_code: 500 });
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }

    // Sort: poorest AI score first (so the worst photos surface at the top), then unscored.
    const members = (data || []).sort((a, b) => {
      const sa = (a.photo_quality as { score?: number } | null)?.score;
      const sb = (b.photo_quality as { score?: number } | null)?.score;
      if (sa == null && sb == null) return 0;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sa - sb;
    });

    // Counts per status for the tab badges.
    const { data: allRows } = await supabase
      .from("users")
      .select("photo_status")
      .not("photo_url", "is", null)
      .eq("status", "approved")
      .limit(2000);
    const counts = { pending: 0, approved: 0, rejected: 0, all: allRows?.length || 0 };
    for (const r of allRows || []) {
      const s = (r.photo_status as string) || "pending";
      if (s in counts) (counts as Record<string, number>)[s]++;
    }

    return NextResponse.json({ members, counts });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/photo-review", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch photos" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPhotoReviewAccess(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { id, action, note } = body as { id?: string; action?: string; note?: string };
    if (!id || !action) return NextResponse.json({ error: "id and action are required" }, { status: 400 });

    const supabase = getServiceClient();
    const { data: target } = await supabase
      .from("users")
      .select("id, name, email, photo_url")
      .eq("id", id)
      .single();
    if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    if (!target.photo_url) return NextResponse.json({ error: "Member has no photo" }, { status: 400 });

    const now = new Date().toISOString();
    let update: Record<string, unknown>;

    switch (action) {
      case "approve":
        // Approve → lock. Member can no longer change it; an official must unlock first.
        update = {
          photo_status: "approved",
          photo_locked: true,
          photo_reviewed_by: session.userId,
          photo_reviewed_at: now,
          photo_review_note: note || null,
        };
        break;
      case "reject":
        // Keep the photo (option 1b), flag it, and email the member to re-upload.
        update = {
          photo_status: "rejected",
          photo_locked: false,
          photo_reviewed_by: session.userId,
          photo_reviewed_at: now,
          photo_review_note: note || null,
        };
        break;
      case "lock":
        update = { photo_locked: true, photo_reviewed_by: session.userId, photo_reviewed_at: now };
        break;
      case "unlock":
        update = { photo_locked: false, photo_status: "pending" };
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const { error } = await supabase.from("users").update(update).eq("id", id);
    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/admin/photo-review", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    logAudit(session.userId, `photo_${action}`, "user", id, { note: note || null, member: target.name });

    let emailed = false;
    if (action === "reject" && target.email) {
      try {
        await sendPhotoRejectionEmail(target.email, target.name || "Member", note);
        emailed = true;
      } catch {
        /* email failure shouldn't block the moderation action */
      }
    }

    return NextResponse.json({ ok: true, emailed });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/photo-review", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
