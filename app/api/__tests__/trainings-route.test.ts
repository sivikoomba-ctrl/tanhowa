import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockIsAdmin = vi.fn();
const mockIsAdminOrOfficial = vi.fn();
const mockLogError = vi.fn();
const mockLogContribution = vi.fn();

const mockTrainings = [
  { id: "t1", title: "Pest Management", status: "upcoming", trainer_name: "Dr. Kumar", created_at: "2026-04-01" },
];
const mockEnrollments = [
  { training_id: "t1", user_id: "user-1", status: "enrolled" },
];

const mockSingle = vi.fn(async () => ({ data: mockTrainings[0], error: null }));
const mockFrom = vi.fn((table: string) => {
  if (table === "training_enrollments") {
    return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: mockEnrollments })) })) };
  }
  return { select: vi.fn(() => ({ order: vi.fn(async () => ({ data: mockTrainings, error: null })) })), insert: vi.fn(() => ({ select: vi.fn(() => ({ single: mockSingle })) })), delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) };
});

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  isAdmin: mockIsAdmin,
  isAdminOrOfficial: mockIsAdminOrOfficial,
}));

vi.mock("@/lib/error-logger", () => ({ logError: mockLogError }));
vi.mock("@/lib/contributions", () => ({ logContribution: mockLogContribution }));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

describe("/api/trainings", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("../trainings/route");
    const req = new Request("http://localhost/api/trainings");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("returns trainings for authenticated user", async () => {
    mockGetSession.mockResolvedValue({ userId: "user-1", email: "test@test.com", role: "member", status: "approved" });
    const { GET } = await import("../trainings/route");
    const req = new Request("http://localhost/api/trainings");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trainings).toBeDefined();
  });

  it("returns 403 for non-official POST", async () => {
    mockGetSession.mockResolvedValue({ userId: "user-1", email: "test@test.com", role: "member", status: "approved" });
    mockIsAdminOrOfficial.mockResolvedValue(false);
    const { POST } = await import("../trainings/route");
    const req = new Request("http://localhost/api/trainings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", trainer_name: "Trainer" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(403);
  });
});
