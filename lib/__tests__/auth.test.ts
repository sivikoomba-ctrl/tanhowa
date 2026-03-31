import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers before importing auth
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

// Mock supabase service client
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: () => ({ from: mockFrom }),
}));

// Now import auth functions
import {
  getSession,
  createSession,
  isAdmin,
  isSuperAdmin,
  isAdminOrOfficial,
  getDbRole,
  getOfficialType,
  DEFAULT_ADMIN_EMAIL,
  type SessionPayload,
} from "@/lib/auth";
import { cookies } from "next/headers";

function mockSession(): SessionPayload {
  return { userId: "user-1", email: "test@example.com", role: "member", status: "approved" };
}

function setupDbChain(returnData: Record<string, unknown> | null) {
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ single: mockSingle });
  mockSingle.mockResolvedValue({ data: returnData });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DEFAULT_ADMIN_EMAIL", () => {
  it("is tanhowaadmin@tanhowa.in", () => {
    expect(DEFAULT_ADMIN_EMAIL).toBe("tanhowaadmin@tanhowa.in");
  });
});

describe("getSession", () => {
  it("returns null when no cookie", async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    } as never);

    const session = await getSession();
    expect(session).toBeNull();
  });

  it("returns null for invalid token", async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "invalid-token" }),
    } as never);

    const session = await getSession();
    expect(session).toBeNull();
  });

  it("returns session payload for valid token", async () => {
    // Create a valid token first
    const setCookie = vi.fn();
    vi.mocked(cookies).mockResolvedValue({
      set: setCookie,
      get: vi.fn(),
    } as never);

    const payload = mockSession();
    await createSession(payload);

    // Extract the token that was set
    const token = setCookie.mock.calls[0][1];

    // Now mock cookies to return that token
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: token }),
    } as never);

    const session = await getSession();
    expect(session).not.toBeNull();
    expect(session!.userId).toBe("user-1");
    expect(session!.email).toBe("test@example.com");
    expect(session!.role).toBe("member");
    expect(session!.status).toBe("approved");
  });
});

describe("getDbRole", () => {
  it("returns role from database", async () => {
    setupDbChain({ role: "admin" });

    const role = await getDbRole("user-1");
    expect(role).toBe("admin");
    expect(mockFrom).toHaveBeenCalledWith("users");
  });

  it("returns null when user not found", async () => {
    setupDbChain(null);

    const role = await getDbRole("nonexistent");
    expect(role).toBeNull();
  });
});

describe("getOfficialType", () => {
  it("returns official_type from database", async () => {
    setupDbChain({ official_type: "state" });

    const type = await getOfficialType("user-1");
    expect(type).toBe("state");
  });

  it("returns null for non-official", async () => {
    setupDbChain({ official_type: null });

    const type = await getOfficialType("user-1");
    expect(type).toBeNull();
  });
});

describe("isAdmin", () => {
  it("returns true for admin role", async () => {
    setupDbChain({ role: "admin" });
    expect(await isAdmin(mockSession())).toBe(true);
  });

  it("returns true for super_admin role", async () => {
    setupDbChain({ role: "super_admin" });
    expect(await isAdmin(mockSession())).toBe(true);
  });

  it("returns false for member role", async () => {
    setupDbChain({ role: "member" });
    expect(await isAdmin(mockSession())).toBe(false);
  });

  it("returns false for null session", async () => {
    expect(await isAdmin(null)).toBe(false);
  });
});

describe("isSuperAdmin", () => {
  it("returns true for super_admin", async () => {
    setupDbChain({ role: "super_admin" });
    expect(await isSuperAdmin(mockSession())).toBe(true);
  });

  it("returns false for admin", async () => {
    setupDbChain({ role: "admin" });
    expect(await isSuperAdmin(mockSession())).toBe(false);
  });

  it("returns false for null session", async () => {
    expect(await isSuperAdmin(null)).toBe(false);
  });
});

describe("isAdminOrOfficial", () => {
  it("returns true for admin", async () => {
    setupDbChain({ role: "admin", official_type: null });
    expect(await isAdminOrOfficial(mockSession())).toBe(true);
  });

  it("returns true for super_admin", async () => {
    setupDbChain({ role: "super_admin", official_type: null });
    expect(await isAdminOrOfficial(mockSession())).toBe(true);
  });

  it("returns true for state official", async () => {
    setupDbChain({ role: "member", official_type: "state" });
    expect(await isAdminOrOfficial(mockSession())).toBe(true);
  });

  it("returns true for district official", async () => {
    setupDbChain({ role: "member", official_type: "district" });
    expect(await isAdminOrOfficial(mockSession())).toBe(true);
  });

  it("returns false for regular member", async () => {
    setupDbChain({ role: "member", official_type: null });
    expect(await isAdminOrOfficial(mockSession())).toBe(false);
  });

  it("returns false for null session", async () => {
    expect(await isAdminOrOfficial(null)).toBe(false);
  });

  it("returns false when user not found", async () => {
    setupDbChain(null);
    expect(await isAdminOrOfficial(mockSession())).toBe(false);
  });
});
