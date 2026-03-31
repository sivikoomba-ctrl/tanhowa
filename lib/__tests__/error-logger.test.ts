import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn(() => Promise.resolve({ data: null, error: null }));
const mockFrom = vi.fn(() => ({ insert: mockInsert }));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: () => ({ from: mockFrom }),
}));

import { logError } from "@/lib/error-logger";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logError", () => {
  it("inserts an error log with required fields", async () => {
    await logError({ type: "api", message: "Something failed" });

    expect(mockFrom).toHaveBeenCalledWith("error_logs");
    expect(mockInsert).toHaveBeenCalledWith({
      type: "api",
      message: "Something failed",
      stack: "",
      path: "",
      method: "",
      status_code: 0,
      user_id: null,
      metadata: {},
      status: "unresolved",
    });
  });

  it("passes all optional fields", async () => {
    await logError({
      type: "auth",
      message: "Auth failed",
      stack: "Error at line 1",
      path: "/api/auth",
      method: "POST",
      status_code: 401,
      user_id: "user-1",
      metadata: { reason: "expired" },
    });

    expect(mockInsert).toHaveBeenCalledWith({
      type: "auth",
      message: "Auth failed",
      stack: "Error at line 1",
      path: "/api/auth",
      method: "POST",
      status_code: 401,
      user_id: "user-1",
      metadata: { reason: "expired" },
      status: "unresolved",
    });
  });

  it("does not throw on insert failure", async () => {
    mockInsert.mockImplementationOnce(() => { throw new Error("DB down"); });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(logError({ type: "client", message: "test" })).resolves.toBeUndefined();

    consoleSpy.mockRestore();
  });
});
