import { describe, expect, it } from "vitest";
import { assertAllItemsMatched } from "@/lib/quotation/guards";

describe("assertAllItemsMatched", () => {
  it("allows quotation generation when every item is matched", () => {
    const result = assertAllItemsMatched([
      { status: "matched", matched_product_id: "p1" },
      { status: "matched", matched_product_id: "p2" },
    ]);
    expect(result.ok).toBe(true);
  });

  it("blocks quotation generation when at least one item is unmatched", () => {
    const result = assertAllItemsMatched([
      { status: "matched", matched_product_id: "p1" },
      { status: "unmatched", matched_product_id: null },
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Impossible de générer le devis");
  });

  it("allows quotation generation when an item is only ambiguous (70-89% confidence) — spec requires a warning + forced approval, not a block", () => {
    const result = assertAllItemsMatched([{ status: "ambiguous", matched_product_id: "p1" }]);
    expect(result.ok).toBe(true);
  });

  it("blocks quotation generation when an item has a status but lost its product reference (e.g. product deleted)", () => {
    const result = assertAllItemsMatched([{ status: "matched", matched_product_id: null }]);
    expect(result.ok).toBe(false);
  });

  it("blocks quotation generation when there are no items at all", () => {
    const result = assertAllItemsMatched([]);
    expect(result.ok).toBe(false);
  });
});
