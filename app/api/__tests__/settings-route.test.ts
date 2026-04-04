import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockIsAdmin = vi.fn();
const mockLogError = vi.fn();
const mockIn = vi.fn(async () => ({
  data: [
    { key: "payment_qr_url", value: "qr.png" },
    { key: "community_name", value: "TANHOWA" },
  ],
}));
const mockSelect = vi.fn(() => ({ in: mockIn }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  isAdmin: mockIsAdmin,
}));

vi.mock("@/lib/error-logger", () => ({
  logError: mockLogError,
}));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

describe("GET /api/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only public settings to non-admin users", async () => {
    mockGetSession.mockResolvedValue({
      userId: "member-1",
      email: "member@example.com",
      role: "member",
      status: "approved",
    });
    mockIsAdmin.mockResolvedValue(false);

    const { GET } = await import("../settings/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockIn).toHaveBeenCalledOnce();
    expect(body.settings).toEqual({
      payment_qr_url: "qr.png",
      community_name: "TANHOWA",
    });
  });
});
