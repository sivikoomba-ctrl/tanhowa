import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  SUPER_ADMIN_EMAILS: new Set(["admin@tanhowa.in"]),
}));
vi.mock("@/lib/error-logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({ check: () => true }),
}));
vi.mock("@/lib/supabase", () => ({
  getServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn(async () => ({ error: null })),
      select: vi.fn(() => ({
        gte: vi.fn(async () => ({ data: [] })),
        eq: vi.fn(() => ({
          gte: vi.fn(async () => ({ data: [] })),
        })),
        order: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: [] })),
        })),
      })),
    })),
  })),
}));

describe("/api/analytics", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("POST accepts events silently", async () => {
    const { POST } = await import("../analytics/route");
    const req = new Request("http://localhost/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
      body: JSON.stringify([{ event_type: "page_view", page_path: "/dashboard" }]),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("GET returns 403 for non-admin", async () => {
    mockGetSession.mockResolvedValue({ userId: "u1", email: "member@test.com", role: "member", status: "approved" });
    const { GET } = await import("../analytics/route");
    const req = new Request("http://localhost/api/analytics?type=summary&period=7d");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(403);
  });

  it("GET returns data for super admin", async () => {
    mockGetSession.mockResolvedValue({ userId: "u1", email: "admin@tanhowa.in", role: "super_admin", status: "approved" });
    const { GET } = await import("../analytics/route");
    const req = new Request("http://localhost/api/analytics?type=summary&period=7d");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
  });
});
