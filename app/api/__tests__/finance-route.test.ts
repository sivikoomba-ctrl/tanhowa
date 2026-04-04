import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockIsAdmin = vi.fn();
const mockGetOfficialInfo = vi.fn();
const mockLogError = vi.fn();

const paidSubscriptions = [
  {
    id: "sub-salem",
    user_id: "member-salem",
    period: "2025",
    amount: 100,
    paid_at: "2025-04-10T10:00:00.000Z",
    approved_at: "2025-04-10T10:05:00.000Z",
    payment_method: "UPI",
    transaction_id: "T100",
    remarks: "",
    payment_group_id: null,
    users: {
      name: "Salem Member",
      phone: "9000000001",
      posting_details: { regular_district: "Salem" },
    },
  },
  {
    id: "sub-madurai",
    user_id: "member-madurai",
    period: "2025",
    amount: 200,
    paid_at: "2025-04-11T10:00:00.000Z",
    approved_at: "2025-04-11T10:05:00.000Z",
    payment_method: "UPI",
    transaction_id: "T200",
    remarks: "",
    payment_group_id: null,
    users: {
      name: "Madurai Member",
      phone: "9000000002",
      posting_details: { regular_district: "Madurai" },
    },
  },
];

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  isAdmin: mockIsAdmin,
  getOfficialInfo: mockGetOfficialInfo,
}));

vi.mock("@/lib/error-logger", () => ({
  logError: mockLogError,
}));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table !== "subscriptions") throw new Error(`Unexpected table ${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(() => ({
              lte: vi.fn(() => ({
                order: vi.fn(async () => ({ data: paidSubscriptions, error: null })),
              })),
            })),
          })),
        })),
      };
    }),
  })),
}));

describe("GET /api/finance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes district officials to their own district ledger", async () => {
    mockGetSession.mockResolvedValue({
      userId: "official-1",
      email: "district@example.com",
      role: "member",
      status: "approved",
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetOfficialInfo.mockResolvedValue({
      role: "member",
      official_type: "district",
      district: "Salem",
    });

    const { GET } = await import("../finance/route");
    const response = await GET({ url: "https://example.com/api/finance?year=2025-26" } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.abstract).toBe(false);
    expect(body.ledger).toHaveLength(1);
    expect(body.ledger[0].member_name).toBe("Salem Member");
    expect(body.byDistrict).toEqual([{ district: "Salem", count: 1, total: 100 }]);
    expect(body.totalCredits).toBe(100);
  });
});
