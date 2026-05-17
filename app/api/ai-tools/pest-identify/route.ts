import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase";
import { getGemini } from "@/lib/gemini";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter(10);
const BUCKET = "pest-identifications";
const GEMINI_MODEL = "gemini-2.5-flash";

async function signRows(supabase: ReturnType<typeof getServiceClient>, rows: { image_path: string }[]) {
  return Promise.all(
    rows.map(async (r) => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(r.image_path, 300);
      return { ...r, image_url: data?.signedUrl || "" };
    })
  );
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!limiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too large (max 10MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const imageData = {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType: file.type,
      },
    };

    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent([
      imageData,
      {
        text: `You are a plant pathologist specializing in Tamil Nadu crops and horticulture.

Analyze this image carefully. Identify any pest, disease, or deficiency visible on the plant.

Return ONLY a JSON object in this exact format:
{"pest_name": "string", "tamil_name": "string or null", "crop": "string", "severity": "mild|moderate|severe", "confidence": "high|medium|low", "treatment": "string", "prevention": "string", "additional_notes": "string or null"}

Rules:
- pest_name: Common English name of the pest or disease
- tamil_name: Tamil name if known, otherwise null
- crop: The crop/plant shown in the image
- severity: Assess visible damage level
- confidence: Your confidence in the identification
- treatment: Recommended treatment (chemical/organic options, dosage if applicable)
- prevention: Preventive measures for future
- additional_notes: Any extra info useful for the farmer
- If the image doesn't show a plant or no pest/disease is visible, return {"pest_name": "No pest/disease detected", "crop": "description of what you see", "severity": "none", "confidence": "high", "treatment": "N/A", "prevention": "General plant care", "tamil_name": null, "additional_notes": null}
- Do not include any explanation outside the JSON`,
      },
    ]);

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not analyze the image. Please try a clearer photo." }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    logContribution(session.userId, "used_ai_pest_id");

    // Persist for ML training — non-blocking on failure (member still gets the answer).
    let savedId: string | null = null;
    try {
      const supabase = getServiceClient();
      try { await supabase.storage.createBucket(BUCKET, { public: false }); } catch { /* already exists */ }

      const ext = (file.name.split(".").pop() || file.type.split("/").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const objectKey = `${session.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectKey, buffer, { contentType: file.type, upsert: false });

      if (!upErr) {
        const { data: userRow } = await supabase
          .from("users")
          .select("posting_details")
          .eq("id", session.userId)
          .maybeSingle();
        const district = (userRow?.posting_details as { regular_district?: string } | null)?.regular_district || "";

        const row = {
          user_id: session.userId,
          member_district: district,
          image_path: objectKey,
          image_size: file.size,
          mime_type: file.type,
          gemini_model_version: GEMINI_MODEL,
          predicted_pest_name: parsed.pest_name || "",
          predicted_tamil_name: parsed.tamil_name || "",
          predicted_crop: parsed.crop || "",
          predicted_severity: parsed.severity || "",
          predicted_confidence: parsed.confidence || "",
          predicted_treatment: parsed.treatment || "",
          predicted_prevention: parsed.prevention || "",
          predicted_additional_notes: parsed.additional_notes || "",
        };
        const { data: inserted } = await supabase
          .from("pest_identifications")
          .insert(row)
          .select("id")
          .maybeSingle();
        savedId = inserted?.id ?? null;
      } else {
        await logError({ type: "api", message: `pest-identify upload failed: ${upErr.message}`, path: "/api/ai-tools/pest-identify", method: "POST", status_code: 500 });
      }
    } catch (persistErr) {
      const msg = persistErr instanceof Error ? persistErr.message : "Unknown error";
      await logError({ type: "api", message: `pest-identify persist failed: ${msg}`, path: "/api/ai-tools/pest-identify", method: "POST", status_code: 500 });
    }

    return NextResponse.json({ ...parsed, id: savedId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/ai-tools/pest-identify", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to analyze image" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("pest_identifications")
      .select("id, created_at, image_path, predicted_pest_name, predicted_tamil_name, predicted_crop, predicted_severity, predicted_confidence, predicted_treatment, predicted_prevention, predicted_additional_notes, user_feedback, review_status, verified_pest_name, verified_tamil_name, verified_crop, verified_severity, verified_notes")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const enriched = await signRows(supabase, data || []);
    return NextResponse.json({ items: enriched });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/ai-tools/pest-identify", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = getServiceClient();
    const { data: row, error: fetchErr } = await supabase
      .from("pest_identifications")
      .select("id, user_id, image_path")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (row.user_id !== session.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await supabase.from("pest_identifications").delete().eq("id", id);
    if (row.image_path) {
      try { await supabase.storage.from(BUCKET).remove([row.image_path]); } catch { /* ignore */ }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/ai-tools/pest-identify", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
