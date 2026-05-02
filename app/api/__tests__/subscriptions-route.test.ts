import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSession = vi.fn();
const mockGetOfficialInfo = vi.fn();
const mockLogError = vi.fn();

const subscriptionRows = [
  {
    id: "sub-salem",
    user_id: "member-salem",
    amount: 100,
    status: "pending",
    users: {
      posting_details: { regular_district: "Salem" },
    },
  },
  {
    id: "sub-madurai",
    user_id: "member-madurai",
    amount: 200,
    status: "paid",
    users: {
      posting_details: { regular_district: "Madurai" },
    },
  },
];

function makeSupabaseMock() {
  const query: Record<string, unknown> = {};
  query.eq = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.range = vi.fn(() => query);
  query.then = (resolve: (v: unknown) => void) =>
    resolve({ data: subscriptionRows, count: subscriptionRows.length, error: null });

  const ownSubscriptionQuery = {
    eq: vi.fn(() => ownSubscriptionQuery),
    order: vi.fn(async () => ({ data: [subscriptionRows[0]], error: null })),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "subscriptions") {
        return {
          select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
            if (options?.head) {
              return {
                eq: vi.fn(async (field: string, value: string) => {
                  if (field !== "status") return { count: 0 };
                  if (value === "paid") return { count: 1 };
                  if (value === "pending") return { count: 1 };
                  if (value === "overdue") return { count: 0 };
                  return { count: 0 };
                }),
              };
            }

            if (columns === "amount") {
              return {
                eq: vi.fn(async () => ({ data: [{ amount: 200 }] })),
              };
            }

            if (columns === "*") {
              return ownSubscriptionQuery;
            }

            return query;
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

vi.mock("@/lib/auth", () => ({
  DEFAULT_ADMIN_EMAIL: "tanhowaadmin@tanhowa.in",
  getSession: mockGetSession,
  getOfficialInfo: mockGetOfficialInfo,
  isAdmin: vi.fn(),
  getDbRole: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: vi.fn(() => makeSupabaseMock()),
}));

vi.mock("@/lib/error-logger", () => ({
  logError: mockLogError,
}));

vi.mock("@/lib/contributions", () => ({
  logContribution: vi.fn(),
}));

vi.mock("@/lib/mail", () => ({
  sendSubscriptionApprovedEmail: vi.fn(),
  notifyPaymentVerified: vi.fn(),
  sendSubscriptionNotification: vi.fn(),
}));

describe("GET /api/subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("limits district officials to subscriptions in their own district", async () => {
    mockGetSession.mockResolvedValue({
      userId: "official-1",
      email: "official@example.com",
      role: "member",
      status: "approved",
    });
    mockGetOfficialInfo.mockResolvedValue({
      role: "member",
      official_type: "district",
      district: "Salem",
    });

    const { GET } = await import("../subscriptions/route");
    const response = await GET({ url: "https://example.com/api/subscriptions" } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.subscriptions).toHaveLength(1);
    expect(body.subscriptions[0].id).toBe("sub-salem");
    expect(body.stats).toEqual({
      paid: 0,
      pending: 1,
      overdue: 0,
      totalCollected: 0,
    });
  });

  it("returns only the current user's subscriptions for regular members", async () => {
    mockGetSession.mockResolvedValue({
      userId: "member-salem",
      email: "member@example.com",
      role: "member",
      status: "approved",
    });
    mockGetOfficialInfo.mockResolvedValue({
      role: "member",
      official_type: null,
      district: null,
    });

    const { GET } = await import("../subscriptions/route");
    const response = await GET({ url: "https://example.com/api/subscriptions" } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.subscriptions).toEqual([subscriptionRows[0]]);
    expect(body.stats).toBeUndefined();
  });
});
