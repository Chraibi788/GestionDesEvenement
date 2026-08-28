import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateMargin, evaluateApprovalRequirement } from "@/lib/pricing/margin";

describe("calculateMargin", () => {
  it("computes margin amount and percent from net price and purchase cost", () => {
    const result = calculateMargin(new Decimal(88.35), 65);
    expect(result.margin_known).toBe(true);
    expect(result.margin_amount!.toNumber()).toBeCloseTo(23.35, 2);
    expect(result.margin_percent!.toNumber()).toBeCloseTo(26.43, 1);
  });

  it("marks margin as unknown (never zero) when purchase cost is unavailable", () => {
    const result = calculateMargin(new Decimal(100), null);
    expect(result.margin_known).toBe(false);
    expect(result.margin_amount).toBeNull();
    expect(result.margin_percent).toBeNull();
  });
});

describe("evaluateApprovalRequirement", () => {
  it("flags a reason when margin is below the company's minimum threshold", () => {
    const result = evaluateApprovalRequirement({
      minimumMarginPercent: 15,
      lineMarginsKnown: [true],
      lineMarginPercents: [new Decimal(10)],
      hasAmbiguousItem: false,
    });
    expect(result.approvalRequired).toBe(true);
    expect(result.reasons.some((r) => r.includes("Marge inférieure"))).toBe(true);
  });

  it("flags a reason when purchase cost (and therefore margin) is unknown", () => {
    const result = evaluateApprovalRequirement({
      minimumMarginPercent: 15,
      lineMarginsKnown: [false],
      lineMarginPercents: [null],
      hasAmbiguousItem: false,
    });
    expect(result.reasons.some((r) => r.includes("absent"))).toBe(true);
  });

  it("flags a reason when an item was matched with only moderate confidence", () => {
    const result = evaluateApprovalRequirement({
      minimumMarginPercent: 15,
      lineMarginsKnown: [true],
      lineMarginPercents: [new Decimal(30)],
      hasAmbiguousItem: true,
    });
    expect(result.reasons.some((r) => r.includes("confiance"))).toBe(true);
  });

  it("requires approval even with a healthy margin (MVP policy: every quotation is reviewed)", () => {
    const result = evaluateApprovalRequirement({
      minimumMarginPercent: 15,
      lineMarginsKnown: [true],
      lineMarginPercents: [new Decimal(40)],
      hasAmbiguousItem: false,
    });
    expect(result.approvalRequired).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});
