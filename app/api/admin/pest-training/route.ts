/**
 * Pest & Disease ML training-data review queue. Super-admin only.
 * GET  — list rows (filterable by review_status), with signed image URLs + member name.
 * PUT  — record an expert verification (confirm / correct / reject / unusable).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";

const BUCKET = "pest-identifications";
const VALID_STATUSES = new Set(["pending", "confirmed", "corrected", "rejected", "unusable"]);

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!(await isSuperAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "pending";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);

    const supabase = getServiceClient();
    let q = supabase
      .from("pest_identifications")
      .select("id, created_at, image_path, member_district, user_id, gemini_model_version, predicted_pest_name, predicted_tamil_name, predicted_crop, predicted_severity, predicted_confidence, predicted_treatment, predicted_prevention, predicted_additional_notes, user_feedback, user_feedback_note, verified_pest_name, verified_tamil_name, verified_crop, verified_severity, verified_notes, verified_by, verified_at, review_status, user:user_id(name, email)")
      .order("created_at", { ascending: status === "pending" });

    if (status !== "all") {
      if (!VALID_STATUSES.has(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      q = q.eq("review_status", status);
    }
    q = q.limit(limit);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const enriched = await Promise.all(
      (data || []).map(async (r) => {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(r.image_path, 600);
        return { ...r, image_url: signed?.signedUrl || "" };
      })
    );

    const counts: Record<string, number> = {};
    for (const s of VALID_STATUSES) {
      const { count } = await supabase
        .from("pest_identifications")
        .select("id", { count: "exact", head: true })
        .eq("review_status", s);
      counts[s] = count || 0;
    }

    return NextResponse.json({ items: enriched, counts });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/pest-training", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load queue" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!(await isSuperAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null) as {
      id?: string;
      action?: "confirm" | "correct" | "reject" | "unusable";
      verified_pest_name?: string;
      verified_tamil_name?: string;
      verified_crop?: string;
      verified_severity?: string;
      verified_notes?: string;
    } | null;

    if (!body?.id || !body.action) {
      return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data: row, error: fetchErr } = await supabase
      .from("pest_identifications")
      .select("id, predicted_pest_name, predicted_tamil_name, predicted_crop, predicted_severity")
      .eq("id", body.id)
      .maybeSingle();
    if (fetchErr || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date().toISOString();
    const base = {
      verified_by: session!.userId,
      verified_at: now,
      verified_notes: (body.verified_notes || "").slice(0, 1000),
    };

    let update: Record<string, unknown>;
    if (body.action === "confirm") {
      update = {
        ...base,
        verified_pest_name: row.predicted_pest_name || "",
        verified_tamil_name: row.predicted_tamil_name || "",
        verified_crop: row.predicted_crop || "",
        verified_severity: row.predicted_severity || "",
        review_status: "confirmed",
      };
    } else if (body.action === "correct") {
      if (!body.verified_pest_name?.trim() || !body.verified_tamil_name?.trim()) {
        return NextResponse.json({ error: "Both English and Tamil pest names are required for a correction" }, { status: 400 });
      }
      update = {
        ...base,
        verified_pest_name: body.verified_pest_name.trim(),
        verified_tamil_name: body.verified_tamil_name.trim(),
        verified_crop: (body.verified_crop || "").trim(),
        verified_severity: (body.verified_severity || "").trim(),
        review_status: "corrected",
      };
    } else if (body.action === "reject") {
      update = { ...base, review_status: "rejected" };
    } else if (body.action === "unusable") {
      update = { ...base, review_status: "unusable" };
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { error: updErr } = await supabase
      .from("pest_identifications")
      .update(update)
      .eq("id", body.id);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/pest-training", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to save verification" }, { status: 500 });
  }
}
