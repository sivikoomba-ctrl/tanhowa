/**
 * Why-Ministry advocacy doc — strictly super-admin (tanhowa19791@gmail.com) only.
 * Stored as a single JSON blob in site_settings (key: why_ministry_doc).
 * Hybrid auto-translate: EN→TA via Gemini on save, but per-field _manual flags
 * preserve hand-edited Tamil fields from being clobbered.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getGemini } from "@/lib/gemini";
import { logError } from "@/lib/error-logger";
import { logAudit } from "@/lib/audit-log";

const OWNER_EMAIL = "tanhowa19791@gmail.com";
const SETTING_KEY = "why_ministry_doc";

interface Section {
  id: string;
  order: number;
  title_en: string;
  title_ta: string;
  body_en: string;
  body_ta: string;
  title_ta_manual: boolean;
  body_ta_manual: boolean;
}

interface Doc {
  title_en: string;
  title_ta: string;
  intro_en: string;
  intro_ta: string;
  title_ta_manual: boolean;
  intro_ta_manual: boolean;
  sections: Section[];
  updated_at: string;
}

const PRESEED_REASONS_EN: string[] = [
  "Specialised crop economics — high-value, perishable, distinct from cereals",
  "Post-harvest infrastructure gap — cold chain, packhouses, processing units",
  "Climate-sensitive horticulture needs distinct policy levers",
  "Export potential under-served — quality protocols, certifications, logistics",
  "Farm-gate price volatility — limited MSP coverage, market reform required",
  "R&D and varietal development — separate institutional focus needed",
  "Workforce skill development — pruning, grading, packaging, protected cultivation",
  "Credit and insurance products — perishable-crop-specific instruments",
  "Plant health and pest surveillance — bio-security focus",
  "Farmer welfare and recognition — terrace, urban and protected horticulture",
];

function defaultDoc(): Doc {
  return {
    title_en: "Why Farmers Need a Ministry of Horticulture",
    title_ta: "",
    intro_en: "",
    intro_ta: "",
    title_ta_manual: false,
    intro_ta_manual: false,
    sections: PRESEED_REASONS_EN.map((title, i) => ({
      id: crypto.randomUUID(),
      order: i,
      title_en: title,
      title_ta: "",
      body_en: "",
      body_ta: "",
      title_ta_manual: false,
      body_ta_manual: false,
    })),
    updated_at: new Date().toISOString(),
  };
}

async function isOwner(session: { email: string } | null) {
  return !!session && session.email === OWNER_EMAIL;
}

async function autoTranslateBatch(items: Record<string, string>): Promise<Record<string, string>> {
  const filtered: Record<string, string> = {};
  for (const [k, v] of Object.entries(items)) {
    if (v && v.trim().length > 0) filtered[k] = v.trim();
  }
  if (Object.keys(filtered).length === 0) return {};

  try {
    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Translate the following JSON values from English to Tamil.
Return ONLY a valid JSON object with the same keys and translated values. No markdown, no code blocks.

Rules:
- Maintain a formal, advocacy-paper tone (this is policy/position-paper text)
- Preserve technical/horticultural and policy terminology accurately
- Use formal Tamil suitable for official correspondence
- Transliterate proper nouns (e.g. TANHOWA stays TANHOWA)
- Preserve newlines and bullet markers verbatim

${JSON.stringify(filtered)}`;

    const result = await model.generateContent([{ text: prompt }]);
    let text = result.response.text().trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }
    const parsed = JSON.parse(text);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && k in filtered) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    const session = await getSession();
    if (!(await isOwner(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();
    const { data } = await supabase
      .from("site_settings")
      .select("value, updated_at")
      .eq("key", SETTING_KEY)
      .maybeSingle();

    if (!data?.value) {
      return NextResponse.json({ doc: defaultDoc(), seeded: false });
    }

    try {
      const doc = JSON.parse(data.value) as Doc;
      return NextResponse.json({ doc, seeded: true });
    } catch {
      return NextResponse.json({ doc: defaultDoc(), seeded: false });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/why-ministry", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!(await isOwner(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as { doc: Doc };
    const incoming = body?.doc;
    if (!incoming || typeof incoming !== "object" || !Array.isArray(incoming.sections)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Hybrid auto-translate: collect EN fields whose corresponding TA is NOT manual
    const toTranslate: Record<string, string> = {};
    if (!incoming.title_ta_manual && incoming.title_en) toTranslate["__title"] = incoming.title_en;
    if (!incoming.intro_ta_manual && incoming.intro_en) toTranslate["__intro"] = incoming.intro_en;
    incoming.sections.forEach((s, i) => {
      if (!s.title_ta_manual && s.title_en) toTranslate[`s${i}_title`] = s.title_en;
      if (!s.body_ta_manual && s.body_en) toTranslate[`s${i}_body`] = s.body_en;
    });

    const translated = await autoTranslateBatch(toTranslate);

    if (translated["__title"] !== undefined) incoming.title_ta = translated["__title"];
    if (translated["__intro"] !== undefined) incoming.intro_ta = translated["__intro"];
    incoming.sections.forEach((s, i) => {
      if (translated[`s${i}_title`] !== undefined) s.title_ta = translated[`s${i}_title`];
      if (translated[`s${i}_body`] !== undefined) s.body_ta = translated[`s${i}_body`];
      if (typeof s.id !== "string" || !s.id) s.id = crypto.randomUUID();
    });

    incoming.updated_at = new Date().toISOString();

    const supabase = getServiceClient();
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: SETTING_KEY, value: JSON.stringify(incoming) }, { onConflict: "key" });

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/why-ministry", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    logAudit(session!.userId, "why_ministry_update", "site_settings", SETTING_KEY, {
      sections: incoming.sections.length,
    });

    return NextResponse.json({ doc: incoming });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/why-ministry", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
