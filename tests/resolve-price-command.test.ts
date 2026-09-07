import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePriceCommand, type PriceCommandProduct } from "@/lib/chat/resolve-price-command";
import type { PriceCommand } from "@/lib/ai/parse-price-command";
import type { CustomerProductPrice } from "@/types/database";

const products: PriceCommandProduct[] = [
  {
    id: "p1",
    sku: "P001",
    name: "Roulement 6205",
    description: null,
    brand: "SKF",
    category: "Roulements",
    packaging: null,
    technical_keywords: null,
    base_sale_price: 95,
    purchase_price: 65,
    currency: "MAD",
  },
  {
    id: "p2",
    sku: "P003",
    name: "Huile hydraulique ISO VG 68",
    description: "Fût 208L",
    brand: "DemoLub",
    category: "Lubrifiants",
    packaging: "208L",
    technical_keywords: ["hydraulic oil", "ISO VG 68"],
    base_sale_price: 3250,
    purchase_price: 2500,
    currency: "MAD",
  },
];

const customer = { default_discount_percent: 0 };
const noExistingPrices = new Map<
  string,
  Pick<CustomerProductPrice, "special_price" | "discount_percent" | "valid_from" | "valid_until">
>();

let originalKey: string | undefined;
beforeEach(() => {
  originalKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY; // deterministic no-AI matching fallback
});
afterEach(() => {
  if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
});

describe("resolvePriceCommand", () => {
  it("computes a correct discount-percent preview from real catalog data", async () => {
    const command: PriceCommand = { intent: "set_discount_percent", product_description: "roulement 6205", value: 10 };
    const result = await resolvePriceCommand(command, products, customer, noExistingPrices, 15);

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.preview.product_id).toBe("p1");
      expect(result.preview.current_net_price).toBe("95.00");
      expect(result.preview.new_net_price).toBe("85.50"); // 95 * 0.9
      // margin = (85.50 - 65) / 85.50 = 23.98%
      expect(result.preview.new_margin_percent).toBe("24.0");
      expect(result.preview.below_minimum_margin).toBe(false);
    }
  });

  it("computes a correct special-price preview and flags a margin below the company minimum", async () => {
    const command: PriceCommand = { intent: "set_special_price", product_description: "roulement 6205", value: 68 };
    const result = await resolvePriceCommand(command, products, customer, noExistingPrices, 15);

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.preview.new_net_price).toBe("68.00");
      // margin = (68 - 65) / 68 = 4.4% < 15% minimum
      expect(result.preview.below_minimum_margin).toBe(true);
    }
  });

  it("never invents a product: returns no_match instead of guessing for an unrecognized description", async () => {
    const command: PriceCommand = { intent: "set_discount_percent", product_description: "produit totalement inconnu xyz", value: 10 };
    const result = await resolvePriceCommand(command, products, customer, noExistingPrices, 15);
    expect(result.status).toBe("no_match");
  });

  it("asks for clarification instead of silently picking a low-confidence match", async () => {
    // Close to the oil product's keywords but not an exact match — same
    // boundary already covered in tests/matching.test.ts for matchRfqItem.
    const command: PriceCommand = {
      intent: "set_discount_percent",
      product_description: "4 futs d'huile hydraulique ISO VG 68 208L",
      value: 5,
    };
    const result = await resolvePriceCommand(command, products, customer, noExistingPrices, 15);
    expect(result.status).toBe("ambiguous");
  });

  it("rejects an out-of-range discount percent without touching the database", async () => {
    const command: PriceCommand = { intent: "set_discount_percent", product_description: "roulement 6205", value: 150 };
    const result = await resolvePriceCommand(command, products, customer, noExistingPrices, 15);
    expect(result.status).toBe("unclear");
  });

  it("returns unclear when the parsed command has no actionable value", async () => {
    const command: PriceCommand = { intent: "unclear", product_description: null, value: null };
    const result = await resolvePriceCommand(command, products, customer, noExistingPrices, 15);
    expect(result.status).toBe("unclear");
  });
});
