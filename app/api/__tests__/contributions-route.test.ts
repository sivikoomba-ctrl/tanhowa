import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSession = vi.fn();
const mockIsAdmin = vi.fn();
const mockLogError = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  isAdmin: mockIsAdmin,
}));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/error-logger", () => ({
  logError: mockLogError,
}));

describe("GET /api/contributions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin users requesting the leaderboard", async () => {
    mockGetSession.mockResolvedValue({
      userId: "user-1",
      email: "member@example.com",
      role: "member",
      status: "approved",
    });
    mockIsAdmin.mockResolvedValue(false);

    const { GET } = await import("../contributions/route");
    const response = await GET({ url: "https://example.com/api/contributions" } as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("rejects non-admin users requesting breakdown data", async () => {
    mockGetSession.mockResolvedValue({
      userId: "user-1",
      email: "member@example.com",
      role: "member",
      status: "approved",
    });
    mockIsAdmin.mockResolvedValue(false);

    const { GET } = await import("../contributions/route");
    const response = await GET({ url: "https://example.com/api/contributions?breakdown=true" } as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });
});
