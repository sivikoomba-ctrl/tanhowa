import { describe, it, expect } from "vitest";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("deduplicates tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

describe("formatDate", () => {
  it("formats a date string as DD/MM/YYYY", () => {
    expect(formatDate("2026-03-15T10:00:00Z")).toMatch(/15\/03\/2026/);
  });

  it("formats a Date object", () => {
    const d = new Date(2026, 0, 5); // Jan 5 2026
    expect(formatDate(d)).toBe("05/01/2026");
  });
});

describe("formatDateTime", () => {
  it("formats a date string as DD/MM/YYYY HH:MM", () => {
    const result = formatDateTime(new Date(2026, 2, 15, 14, 30));
    expect(result).toBe("15/03/2026 14:30");
  });
});
