import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSession = vi.fn();
const mockGetDbRole = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockCreateSignedUrl = vi.fn();
const mockStorageFrom = vi.fn(() => ({ createSignedUrl: mockCreateSignedUrl }));

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  getDbRole: mockGetDbRole,
}));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: vi.fn(() => ({
    from: mockFrom,
    storage: { from: mockStorageFrom },
  })),
}));

describe("POST /api/upload/payment-proof/signed-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the subscription's stored proof path for the owner", async () => {
    mockGetSession.mockResolvedValue({
      userId: "user-1",
      email: "member@example.com",
      role: "member",
      status: "approved",
    });
    mockGetDbRole.mockResolvedValue("member");
    mockSingle.mockResolvedValue({
      data: {
        user_id: "user-1",
        payment_proof_url: "stored-proof.jpg",
      },
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://project.supabase.co/storage/v1/object/sign/payment-proofs/stored-proof.jpg?token=abc" },
      error: null,
    });

    const { POST } = await import("../upload/payment-proof/signed-url/route");
    const response = await POST({
      json: async () => ({
        subscription_id: "sub-1",
      }),
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://project.supabase.co/storage/v1/object/sign/payment-proofs/stored-proof.jpg?token=abc",
    });
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("stored-proof.jpg", 300);
  });

  it("rejects members requesting another user's valid proof path", async () => {
    mockGetSession.mockResolvedValue({
      userId: "user-1",
      email: "member@example.com",
      role: "member",
      status: "approved",
    });
    mockGetDbRole.mockResolvedValue("member");
    mockSingle.mockResolvedValue({
      data: {
        user_id: "user-2",
        payment_proof_url: "stored-proof.jpg",
      },
    });

    const { POST } = await import("../upload/payment-proof/signed-url/route");
    const response = await POST({
      json: async () => ({
        file_path: "stored-proof.jpg",
        subscription_id: "sub-2",
      }),
    } as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });
});
