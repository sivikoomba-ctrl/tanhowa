import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendTelegramMessage = vi.fn();
const mockSendOTPEmail = vi.fn();
const mockOtpUpdateEqUsed = vi.fn(async () => ({ error: null }));
const mockOtpUpdateEqPurpose = vi.fn(() => ({ eq: mockOtpUpdateEqUsed }));
const mockOtpUpdateEqEmail = vi.fn(() => ({ eq: mockOtpUpdateEqPurpose }));
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
          update: vi.fn(() => ({ eq: mockOtpUpdateEqEmail })),
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
    process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
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
      headers: new Headers({
        "x-telegram-bot-api-secret-token": "test-secret",
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(mockOtpUpdateEqEmail).toHaveBeenCalledWith("email", "member@example.com");
    expect(mockOtpUpdateEqPurpose).toHaveBeenCalledWith("purpose", "telegram_link");
    expect(mockOtpUpdateEqUsed).toHaveBeenCalledWith("used", false);
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      email: "member@example.com",
      purpose: "telegram_link",
    }));
    expect(mockSendOTPEmail).toHaveBeenCalledOnce();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("/link member@example.com 123456")
    );
  });

  it("rejects requests when the webhook secret header is missing", async () => {
    const { POST } = await import("../telegram/webhook/route");
    const response = await POST({
      json: async () => ({
        message: {
          chat: { id: 12345 },
          text: "/start",
        },
      }),
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(403);
  });
});
