import { describe, expect, it } from "vitest";
import { calculatePrice } from "@/lib/pricing/calculate-price";
import { calculateQuotation } from "@/lib/pricing/calculate-quotation";

const product = { base_sale_price: 95 };
const customerWithDefaultDiscount = { default_discount_percent: 7 };
const customerNoDiscount = { default_discount_percent: 0 };

describe("calculatePrice", () => {
  it("uses base price when there is no customer and no special price", () => {
    const result = calculatePrice(product, null, null);
    expect(result.net_unit_price.toNumber()).toBe(95);
    expect(result.pricing_source).toBe("base_price");
  });

  it("applies the customer's default discount when no special pricing exists", () => {
    const result = calculatePrice(product, customerWithDefaultDiscount, null);
    expect(result.net_unit_price.toNumber()).toBeCloseTo(88.35, 2);
    expect(result.pricing_source).toBe("customer_default_discount");
  });

  it("does not apply a discount when the customer's default discount is zero", () => {
    const result = calculatePrice(product, customerNoDiscount, null);
    expect(result.net_unit_price.toNumber()).toBe(95);
    expect(result.pricing_source).toBe("base_price");
  });

  it("prioritizes a valid customer-specific special price over every discount", () => {
    const result = calculatePrice(product, customerWithDefaultDiscount, {
      special_price: 80,
      discount_percent: 50, // should be ignored — special_price wins
      valid_from: null,
      valid_until: null,
    });
    expect(result.net_unit_price.toNumber()).toBe(80);
    expect(result.pricing_source).toBe("special_price");
  });

  it("prioritizes a valid customer-specific discount over the customer's default discount", () => {
    const result = calculatePrice(product, customerWithDefaultDiscount, {
      special_price: null,
      discount_percent: 10,
      valid_from: null,
      valid_until: null,
    });
    expect(result.net_unit_price.toNumber()).toBeCloseTo(85.5, 2);
    expect(result.pricing_source).toBe("customer_product_discount");
  });

  it("falls back to the customer's default discount when a special price has expired", () => {
    const asOf = new Date("2026-06-01");
    const result = calculatePrice(
      product,
      customerWithDefaultDiscount,
      { special_price: 50, discount_percent: null, valid_from: "2020-01-01", valid_until: "2020-12-31" },
      asOf
    );
    expect(result.net_unit_price.toNumber()).toBeCloseTo(88.35, 2);
    expect(result.pricing_source).toBe("customer_default_discount");
  });

  it("falls back to the customer's default discount when a special price is not yet valid", () => {
    const asOf = new Date("2026-01-01");
    const result = calculatePrice(
      product,
      customerWithDefaultDiscount,
      { special_price: 50, discount_percent: null, valid_from: "2027-01-01", valid_until: null },
      asOf
    );
    expect(result.pricing_source).toBe("customer_default_discount");
  });
});

describe("calculateQuotation", () => {
  it("matches the spec's demo scenario exactly (20x roulement 6205 + 4x huile hydraulique, ABC Industrie 7%, 20% VAT)", () => {
    const calculation = calculateQuotation(
      [
        { product: { id: "p1", base_sale_price: 95, purchase_price: 65, unit: "unit" }, quantity: 20, description: "Roulement 6205" },
        {
          product: { id: "p2", base_sale_price: 3250, purchase_price: 2500, unit: "fut" },
          quantity: 4,
          description: "Huile hydraulique ISO VG 68",
        },
      ],
      customerWithDefaultDiscount,
      20
    );

    expect(calculation.lines[0].net_unit_price).toBeCloseTo(88.35, 2);
    expect(calculation.lines[0].line_subtotal).toBeCloseTo(1767, 2);
    expect(calculation.lines[1].net_unit_price).toBeCloseTo(3022.5, 2);
    expect(calculation.lines[1].line_subtotal).toBeCloseTo(12090, 2);

    expect(calculation.subtotal).toBeCloseTo(13857, 2);
    expect(calculation.discount_total).toBeCloseTo(1043, 2);
    expect(calculation.vat_amount).toBeCloseTo(2771.4, 2);
    expect(calculation.total).toBeCloseTo(16628.4, 2);
  });

  it("rounds monetary values to 2 decimals and never uses unsafe floating point", () => {
    const calculation = calculateQuotation(
      [{ product: { id: "p1", base_sale_price: 10.005, purchase_price: null, unit: "unit" }, quantity: 3, description: "x" }],
      null,
      19
    );
    // 10.005 * 3 = 30.015 -> rounds to 30.02 (half-up), never a floating point artifact like 30.014999999999997
    expect(calculation.subtotal).toBe(30.02);
    expect(Number.isInteger(calculation.subtotal * 100)).toBe(true);
  });

  it("reports margin as unknown (not zero) when purchase cost is missing", () => {
    const calculation = calculateQuotation(
      [{ product: { id: "p1", base_sale_price: 100, purchase_price: null, unit: "unit" }, quantity: 1, description: "x" }],
      null,
      20
    );
    expect(calculation.lines[0].line_margin_percent).toBeNull();
    expect(calculation.estimated_margin_percent).toBeNull();
  });
});
