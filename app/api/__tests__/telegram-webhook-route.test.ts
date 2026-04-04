import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendTelegramMessage = vi.fn();
const mockSendOTPEmail = vi.fn();
const mockInsert = vi.fn(async () => ({ error: null }));
const mockUpdateEq = vi.fn(async () => ({ error: null }));
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));

vi.mock("@/lib/telegram", () => ({
  sendTelegramMessage: mockSendTelegramMessage,
}));

vi.mock("@/lib/mail", () => ({
  sendOTPEmail: mockSendOTPEmail,
}));

vi.mock("@/lib/error-logger", () => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn(() => ({ eq: mockEq })),
          update: mockUpdate,
        };
      }
      if (table === "otp_codes") {
        return {
          insert: mockInsert,
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gt: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({ single: mockSingle })),
                    })),
                  })),
                })),
              })),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }
      if (table === "todos") {
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn() })) })),
        };
      }
      if (table === "team_members") {
        return {
          select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [] })) })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  })),
}));

describe("POST /api/telegram/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET = "";
  });

  it("sends an OTP for email linking instead of linking the account directly", async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: "user-1", name: "Member One", telegram_chat_id: null },
      error: null,
    });

    const { POST } = await import("../telegram/webhook/route");
    const response = await POST({
      json: async () => ({
        message: {
          chat: { id: 12345 },
          text: "member@example.com",
        },
      }),
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockSendOTPEmail).toHaveBeenCalledOnce();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("/link member@example.com 123456")
    );
  });
});
