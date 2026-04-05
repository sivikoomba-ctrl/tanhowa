import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockIlike = vi.fn(async () => ({ data: [] }));
const mockLimit = vi.fn(() => ({ ilike: mockIlike }));
const mockEq = vi.fn(() => ({ ilike: mockIlike, limit: mockLimit }));
const mockSelect = vi.fn(() => ({ eq: mockEq, ilike: mockIlike, limit: mockLimit }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({ check: () => true }),
}));
vi.mock("@/lib/supabase", () => ({
  getServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

describe("GET /api/search", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("../search/route");
    const req = new Request("http://localhost/api/search?q=test");
    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });

  it("returns empty results for short query", async () => {
    mockGetSession.mockResolvedValue({ userId: "u1", email: "a@b.com", role: "member", status: "approved" });
    const { GET } = await import("../search/route");
    const req = new Request("http://localhost/api/search?q=a");
    const res = await GET(req as any);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("searches across tables for valid query", async () => {
    mockGetSession.mockResolvedValue({ userId: "u1", email: "a@b.com", role: "member", status: "approved" });
    const { GET } = await import("../search/route");
    const req = new Request("http://localhost/api/search?q=meeting");
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalled();
  });
});
