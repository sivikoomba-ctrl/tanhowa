const TANHOWA_NAME_KEYWORDS = [
  "TAMILNADU THOTTAKALAI",
  "THOTTAKALAI ALUVALARGAL",
  "NALA SANGAM",
  "TANHOWA",
];

function normalizeUpper(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

export function isTrustedPaymentProofUrl(imageUrl: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;

  try {
    const remoteUrl = new URL(imageUrl);
    const trustedBase = new URL(supabaseUrl);

    if (remoteUrl.protocol !== "https:" || remoteUrl.origin !== trustedBase.origin) {
      return false;
    }

    return (
      remoteUrl.pathname.startsWith("/storage/v1/object/sign/payment-proofs/") ||
      remoteUrl.pathname.startsWith("/storage/v1/render/image/sign/payment-proofs/")
    );
  } catch {
    return false;
  }
}

export function isTanhowaPayment(details: { paid_to?: string | null; paid_account?: string | null }) {
  const paidTo = normalizeUpper(details.paid_to);
  const paidAccount = normalizeUpper(details.paid_account);

  return TANHOWA_NAME_KEYWORDS.some((keyword) => paidTo.includes(keyword) || paidAccount.includes(keyword));
}

export function buildCertifiedRemarks(adminRemarks?: string | null, verifiedAt = new Date()) {
  const verifiedOn = verifiedAt.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const note = adminRemarks?.trim();

  return note
    ? `Verified & Certified. ${note} Verified on: ${verifiedOn}`
    : `Verified & Certified. Verified on: ${verifiedOn}`;
}
