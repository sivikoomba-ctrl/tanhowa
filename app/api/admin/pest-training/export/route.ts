/**
 * Export verified pest-identification rows as a labeled training dataset.
 * Super-admin only. Returns JSONL (default) or CSV manifest.
 *
 * Image bytes are NOT bundled — each row carries a 15-min signed URL the
 * consumer downloads separately (avoids serverless 4.5MB body cap).
 *
 * Member IDs are sha256-hashed for anonymization.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSession, isSuperAdmin } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/error-logger";

const BUCKET = "pest-identifications";
const SIGN_TTL_SEC = 60 * 15;

function hashUser(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 16);
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!(await isSuperAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const format = (url.searchParams.get("format") || "jsonl").toLowerCase();

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("pest_identifications")
      .select("id, created_at, image_path, member_district, user_id, gemini_model_version, predicted_pest_name, predicted_tamil_name, predicted_crop, predicted_severity, user_feedback, verified_pest_name, verified_tamil_name, verified_crop, verified_severity, verified_notes, review_status")
      .in("review_status", ["confirmed", "corrected"])
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = await Promise.all(
      (data || []).map(async (r) => {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(r.image_path, SIGN_TTL_SEC);
        return {
          id: r.id,
          captured_at: r.created_at,
          image_url: signed?.signedUrl || "",
          image_path: r.image_path,
          member_hash: hashUser(r.user_id),
          member_district: r.member_district || "",
          label: {
            pest_name: r.verified_pest_name || "",
            tamil_name: r.verified_tamil_name || "",
            crop: r.verified_crop || "",
            severity: r.verified_severity || "",
            notes: r.verified_notes || "",
          },
          model_prediction: {
            model: r.gemini_model_version || "",
            pest_name: r.predicted_pest_name || "",
            tamil_name: r.predicted_tamil_name || "",
            crop: r.predicted_crop || "",
            severity: r.predicted_severity || "",
          },
          user_feedback: r.user_feedback || "",
          source: r.review_status,
        };
      })
    );

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (format === "csv") {
      const headers = [
        "id", "captured_at", "image_url", "image_path", "member_hash", "member_district",
        "label.pest_name", "label.tamil_name", "label.crop", "label.severity", "label.notes",
        "model_prediction.model", "model_prediction.pest_name", "model_prediction.tamil_name", "model_prediction.crop", "model_prediction.severity",
        "user_feedback", "source",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [headers.join(",")];
      for (const r of rows) {
        lines.push([
          r.id, r.captured_at, r.image_url, r.image_path, r.member_hash, r.member_district,
          r.label.pest_name, r.label.tamil_name, r.label.crop, r.label.severity, r.label.notes,
          r.model_prediction.model, r.model_prediction.pest_name, r.model_prediction.tamil_name, r.model_prediction.crop, r.model_prediction.severity,
          r.user_feedback, r.source,
        ].map(esc).join(","));
      }
      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="tanhowa-pest-training-${stamp}.csv"`,
        },
      });
    }

    // Default: JSONL
    const body = rows.map((r) => JSON.stringify(r)).join("\n");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="tanhowa-pest-training-${stamp}.jsonl"`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/admin/pest-training/export", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to export" }, { status: 500 });
  }
}
