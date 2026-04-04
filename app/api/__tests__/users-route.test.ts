import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockGetDbRole = vi.fn();
const mockRange = vi.fn(async () => ({
  data: [
    {
      id: "user-1",
      name: "Member One",
      email: "member1@example.com",
      occupation: "HO",
      phone: "9000000001",
      photo_url: "photo.png",
      role: "member",
      official_type: null,
      posting_details: { regular_district: "Salem" },
      social_links: { qualification: "BSc" },
      created_at: "2026-01-01T00:00:00.000Z",
      last_active_at: "2026-04-01T00:00:00.000Z",
    },
  ],
  count: 1,
}));
const mockOr = vi.fn(() => ({ range: mockRange }));
const mockNeq = vi.fn(() => ({ or: mockOr, range: mockRange }));
const mockEq = vi.fn(() => ({ neq: mockNeq, or: mockOr, range: mockRange }));
const mockOrder = vi.fn(() => ({ eq: mockEq, neq: mockNeq, or: mockOr, range: mockRange }));
const mockSelect = vi.fn(() => ({ order: mockOrder }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  getDbRole: mockGetDbRole,
}));

vi.mock("@/lib/error-logger", () => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

describe("GET /api/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redacts member directory responses for non-admin users", async () => {
    mockGetSession.mockResolvedValue({
      userId: "member-1",
      email: "member@example.com",
      role: "member",
      status: "approved",
    });
    mockGetDbRole.mockResolvedValue("member");

    const { GET } = await import("../users/route");
    const response = await GET({ url: "https://example.com/api/users?limit=10" } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSelect).toHaveBeenCalledWith(
      "id, name, email, occupation, phone, photo_url, role, official_type, posting_details, social_links, created_at, last_active_at",
      { count: "exact" }
    );
    expect(body.users[0].status).toBeUndefined();
    expect(body.users[0].address).toBeUndefined();
    expect(body.users[0].dob).toBeUndefined();
  });
});
