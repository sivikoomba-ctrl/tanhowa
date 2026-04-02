import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCertifiedRemarks, isTanhowaPayment, isTrustedPaymentProofUrl } from "../payment-verification";

describe("payment verification helpers", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    vi.useRealTimers();
  });

  it("accepts only trusted Supabase signed proof URLs", () => {
    expect(isTrustedPaymentProofUrl("https://project.supabase.co/storage/v1/object/sign/payment-proofs/member-proof.png?token=abc")).toBe(true);
    expect(isTrustedPaymentProofUrl("https://evil.example.com/storage/v1/object/sign/payment-proofs/member-proof.png?token=abc")).toBe(false);
    expect(isTrustedPaymentProofUrl("https://project.supabase.co/storage/v1/object/sign/other-bucket/member-proof.png?token=abc")).toBe(false);
  });

  it("requires TANHOWA identifiers instead of matching only account suffix digits", () => {
    expect(isTanhowaPayment({ paid_to: "TANHOWA State Unit", paid_account: "tanhowa@upi" })).toBe(true);
    expect(isTanhowaPayment({ paid_to: "Sivakumar", paid_account: "****2486" })).toBe(false);
  });

  it("builds certification remarks in the receipt-friendly format", () => {
    const verifiedAt = new Date(2026, 3, 3, 9, 45);

    expect(buildCertifiedRemarks("S. Sivakumar, State Secretary, TANHOWA.", verifiedAt)).toContain("Verified & Certified.");
    expect(buildCertifiedRemarks("S. Sivakumar, State Secretary, TANHOWA.", verifiedAt)).toContain("Verified on:");
    expect(buildCertifiedRemarks("", verifiedAt)).toContain("03 Apr 2026");
  });
});
