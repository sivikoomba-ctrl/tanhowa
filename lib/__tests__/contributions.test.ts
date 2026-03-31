import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn(() => Promise.resolve({ data: null, error: null }));
const mockFrom = vi.fn(() => ({ insert: mockInsert }));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: () => ({ from: mockFrom }),
}));

import { getActionConfig, logContribution, type ContributionAction } from "@/lib/contributions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getActionConfig", () => {
  it("returns config for all action types", () => {
    const actions: ContributionAction[] = [
      "payment_proof_uploaded", "payment_verified", "payment_rejected", "payment_hold",
      "member_approved", "member_rejected",
      "announcement_created", "event_created", "document_uploaded",
      "suggestion_submitted", "grievance_submitted", "grievance_responded",
      "task_created", "task_committed", "task_updated", "task_note_added", "task_report_added",
      "voucher_submitted", "voucher_approved", "voucher_rejected",
      "profile_updated", "expense_voucher_submitted",
    ];

    for (const action of actions) {
      const config = getActionConfig(action);
      expect(config, `missing config for ${action}`).toBeDefined();
      expect(config.label).toBeTruthy();
      expect(config.minutes).toBeGreaterThan(0);
    }
  });

  it("has correct minutes for key actions", () => {
    expect(getActionConfig("announcement_created").minutes).toBe(10);
    expect(getActionConfig("payment_hold").minutes).toBe(2);
    expect(getActionConfig("task_updated").minutes).toBe(3);
  });
});

describe("logContribution", () => {
  it("inserts with default description from config", () => {
    logContribution("user-1", "task_created");

    expect(mockFrom).toHaveBeenCalledWith("contributions");
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: "user-1",
      action: "task_created",
      description: "Created task",
      estimated_minutes: 5,
      metadata: {},
    });
  });

  it("uses custom description when provided", () => {
    logContribution("user-2", "payment_verified", "Verified payment for 2026");

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Verified payment for 2026",
      })
    );
  });

  it("passes metadata when provided", () => {
    logContribution("user-3", "member_approved", undefined, { memberId: "abc" });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { memberId: "abc" },
      })
    );
  });

  it("does not throw on insert failure", () => {
    mockInsert.mockImplementationOnce(() => Promise.reject(new Error("DB error")));

    expect(() => logContribution("user-4", "profile_updated")).not.toThrow();
  });
});
