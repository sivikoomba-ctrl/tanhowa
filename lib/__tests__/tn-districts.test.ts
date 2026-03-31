import { describe, it, expect } from "vitest";
import { TN_DISTRICTS } from "@/lib/tn-districts";

describe("TN_DISTRICTS", () => {
  it("has 38 districts", () => {
    expect(Object.keys(TN_DISTRICTS)).toHaveLength(38);
  });

  it("includes Chennai", () => {
    expect(TN_DISTRICTS).toHaveProperty("Chennai");
  });

  it("every district has at least one block", () => {
    for (const [district, blocks] of Object.entries(TN_DISTRICTS)) {
      expect(blocks.length, `${district} has no blocks`).toBeGreaterThan(0);
    }
  });

  it("all blocks are non-empty strings", () => {
    for (const [district, blocks] of Object.entries(TN_DISTRICTS)) {
      for (const block of blocks) {
        expect(typeof block, `block in ${district}`).toBe("string");
        expect(block.trim().length, `empty block in ${district}`).toBeGreaterThan(0);
      }
    }
  });
});
