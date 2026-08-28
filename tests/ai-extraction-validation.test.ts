import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rfqExtractionSchema, extractRfq } from "@/lib/ai/extract-rfq";

describe("rfqExtractionSchema", () => {
  it("accepts a well-formed extraction matching the demo RFQ", () => {
    const parsed = rfqExtractionSchema.safeParse({
      language: "fr",
      intent: "quotation_request",
      customer_name: null,
      requested_delivery: null,
      notes: null,
      items: [
        { raw_description: "20 roulements 6205", quantity: 20, unit: null, brand_requested: null, sku_requested: null },
        { raw_description: "4 fûts d'huile hydraulique ISO VG 68", quantity: 4, unit: "fut", brand_requested: null, sku_requested: null },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a null quantity flagged as unclear instead of an invented number", () => {
    const parsed = rfqExtractionSchema.safeParse({
      language: "darija",
      intent: "quotation_request",
      items: [{ raw_description: "bghina roulement 6205", quantity: null, quantity_unclear: true }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items[0].quantity).toBeNull();
      expect(parsed.data.items[0].quantity_unclear).toBe(true);
    }
  });

  it("rejects a response with an invalid language enum value", () => {
    const parsed = rfqExtractionSchema.safeParse({
      language: "spanish",
      intent: "quotation_request",
      items: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a response missing the required items array", () => {
    const parsed = rfqExtractionSchema.safeParse({ language: "fr", intent: "quotation_request" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an item with a negative quantity (never trust an invented/invalid number)", () => {
    const parsed = rfqExtractionSchema.safeParse({
      language: "fr",
      intent: "quotation_request",
      items: [{ raw_description: "x", quantity: -5 }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("extractRfq safe-failure behavior", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("never throws when the AI service is not configured — returns a safe failure instead", async () => {
    const result = await extractRfq("Bonjour, merci de nous chiffrer 20 roulements 6205.");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("ANTHROPIC_API_KEY");
    }
  });
});
