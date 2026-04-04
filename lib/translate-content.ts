/**
 * Auto-translate user-generated content (EN↔TA) using Gemini.
 * Stores translations in `content_translations` table for caching.
 */

import { getGemini } from "@/lib/gemini";
import { getServiceClient } from "@/lib/supabase";

/** Check if text is predominantly Tamil (>30% Tamil Unicode chars) */
function isTamil(text: string): boolean {
  if (!text || text.length === 0) return false;
  const tamilChars = (text.match(/[\u0B80-\u0BFF]/g) || []).length;
  return tamilChars / text.length > 0.3;
}

/**
 * Fire-and-forget: translate fields for a record and store in DB.
 * Call this after creating/updating content — never awaited in the request path.
 */
export function translateContent(
  sourceTable: string,
  sourceId: string,
  fields: Record<string, string>,
  direction: "en-ta" | "ta-en" = "en-ta"
): void {
  (async () => {
    try {
      // Filter out empty fields and already-Tamil text (for en-ta direction)
      const toTranslate: Record<string, string> = {};
      for (const [key, val] of Object.entries(fields)) {
        if (!val || val.trim().length === 0) continue;
        if (direction === "en-ta" && isTamil(val)) continue;
        if (direction === "ta-en" && !isTamil(val)) continue;
        toTranslate[key] = val.trim();
      }

      if (Object.keys(toTranslate).length === 0) return;

      const sourceLang = direction === "en-ta" ? "English" : "Tamil";
      const targetLang = direction === "en-ta" ? "Tamil" : "English";

      const genAI = getGemini();
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `Translate the following JSON values from ${sourceLang} to ${targetLang}.
Return ONLY a valid JSON object with the same keys and translated values. No markdown, no code blocks, no explanations.

Rules:
- Maintain the original tone and formality level
- Preserve technical/horticultural terminology accurately
- For official/formal text, use formal ${targetLang}
- If the text contains proper nouns, transliterate them appropriately
- Preserve any formatting (newlines, bullet points)

${JSON.stringify(toTranslate)}`;

      const result = await model.generateContent([{ text: prompt }]);
      let responseText = result.response.text().trim();

      // Strip markdown code blocks if present
      if (responseText.startsWith("```")) {
        responseText = responseText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      }

      const translated: Record<string, string> = JSON.parse(responseText);

      const supabase = getServiceClient();
      const lang = direction === "en-ta" ? "ta" : "en";

      // Upsert each translated field
      const rows = Object.entries(translated)
        .filter(([key]) => key in toTranslate)
        .map(([key, val]) => ({
          source_table: sourceTable,
          source_id: sourceId,
          field: key,
          lang,
          translated_text: typeof val === "string" ? val : JSON.stringify(val),
        }));

      if (rows.length > 0) {
        await supabase
          .from("content_translations")
          .upsert(rows, { onConflict: "source_table,source_id,field,lang" });
      }
    } catch {
      // Silent failure — original content shown as fallback
    }
  })();
}

/**
 * Batch fetch cached translations for a list of source IDs.
 * Returns: { [sourceId]: { field1: translatedText, field2: translatedText } }
 */
export async function getTranslations(
  sourceTable: string,
  sourceIds: string[],
  lang: string = "ta"
): Promise<Record<string, Record<string, string>>> {
  if (sourceIds.length === 0) return {};

  const supabase = getServiceClient();
  const { data } = await supabase
    .from("content_translations")
    .select("source_id, field, translated_text")
    .eq("source_table", sourceTable)
    .eq("lang", lang)
    .in("source_id", sourceIds);

  const result: Record<string, Record<string, string>> = {};
  for (const row of data || []) {
    if (!result[row.source_id]) result[row.source_id] = {};
    result[row.source_id][row.field] = row.translated_text;
  }
  return result;
}
