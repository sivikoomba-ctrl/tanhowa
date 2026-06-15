/**
 * WhatsApp notifications via the Meta WhatsApp Cloud API.
 *
 * Business-initiated messages must use PRE-APPROVED templates. This module is a
 * thin send abstraction — it stays inert (no-op, returns false) until the three
 * env vars are set, so it is safe to deploy ahead of Meta onboarding:
 *   WHATSAPP_PHONE_NUMBER_ID   — the Cloud API phone-number id
 *   WHATSAPP_ACCESS_TOKEN      — permanent access token
 *   WHATSAPP_GRAPH_VERSION     — optional, defaults to v21.0
 *
 * Callers must also check the recipient opted in (notification_prefs.whatsapp)
 * before sending — this module only handles delivery.
 */

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";

export function whatsappEnabled(): boolean {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

/**
 * Normalise an Indian phone number to the digits-with-country-code form Meta
 * expects (e.g. "919876543210"). Returns null if it can't be made into a
 * plausible 12-digit Indian number.
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 10) return "91" + d;                       // bare 10-digit
  if (d.length === 11 && d.startsWith("0")) return "91" + d.slice(1); // 0XXXXXXXXXX
  if (d.length === 12 && d.startsWith("91")) return d;        // already 91XXXXXXXXXX
  if (d.length === 13 && d.startsWith("091")) return d.slice(1);
  return null;
}

export interface TemplateComponent {
  type: "header" | "body" | "button";
  parameters: { type: "text"; text: string }[];
  sub_type?: string;
  index?: string;
}

/**
 * Send a template message. `bodyParams` are the ordered {{1}}, {{2}}… variables
 * for the template body. Returns true on a 2xx from Meta. Never throws.
 */
export async function sendWhatsAppTemplate(
  toPhone: string | null | undefined,
  templateName: string,
  bodyParams: string[] = [],
  languageCode = "en",
): Promise<boolean> {
  if (!whatsappEnabled()) return false;
  const to = toWhatsAppNumber(toPhone);
  if (!to) return false;

  const components: TemplateComponent[] = bodyParams.length
    ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text: String(text) })) }]
    : [];

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            ...(components.length ? { components } : {}),
          },
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}
