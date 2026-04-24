import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({ generateContent: mockGenerateContent }));
const mockGetGemini = vi.fn(() => ({ getGenerativeModel: mockGetGenerativeModel }));
const mockLogError = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/lib/gemini", () => ({
  getGemini: mockGetGemini,
}));

vi.mock("@/lib/error-logger", () => ({
  logError: mockLogError,
}));

describe("POST /api/upload/payment-proof/extract-date", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    mockGetSession.mockResolvedValue({
      userId: "user-1",
      email: "member@example.com",
      role: "member",
      status: "approved",
    });
  });

  it("rejects untrusted remote image URLs before fetching them", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const formData = new FormData();
    formData.append("image_url", "https://evil.example.com/internal-metadata");

    const { POST } = await import("../upload/payment-proof/extract-date/route");
    const response = await POST({
      formData: async () => formData,
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid image URL" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does not mark a payment as TANHOWA-only from account suffix digits", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: new Headers({ "content-type": "image/png" }),
    } as Response);
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          '{"date":"2026-04-03","time":"10:15","transaction_id":"T12345","payment_method":"UPI","amount":3000,"paid_to":"Sivakumar","paid_account":"****2486"}',
      },
    });

    const formData = new FormData();
    formData.append("image_url", "https://project.supabase.co/storage/v1/object/sign/payment-proofs/member-proof.png?token=abc");

    const { POST } = await import("../upload/payment-proof/extract-date/route");
    const response = await POST({
      formData: async () => formData,
      headers: new Headers(),
    } as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.is_tanhowa_payment).toBe(false);
    fetchSpy.mockRestore();
  });
});
