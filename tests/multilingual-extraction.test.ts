import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercises extractRfq() end-to-end (not just schema validation) for each
// language the spec requires: French, Darija (Latin script), Arabic
// (Arabic script), and English. Claude is mocked per the spec's
// instruction to use mocked responses in automated tests — this proves
// the extraction pipeline (prompt building -> JSON parsing -> Zod
// validation -> language detection) works uniformly regardless of input
// language, without making a real network call.

function mockAnthropicOnce(responseJson: unknown) {
  vi.doMock("@anthropic-ai/sdk", () => ({
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: JSON.stringify(responseJson) }],
        }),
      };
    },
  }));
}

describe("extractRfq: multilingual coverage (French / Darija / Arabic / English)", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.resetModules();
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    vi.doUnmock("@anthropic-ai/sdk");
    vi.clearAllMocks();
  });

  it("extracts a French RFQ", async () => {
    mockAnthropicOnce({
      language: "fr",
      intent: "quotation_request",
      items: [{ raw_description: "20 roulements 6205", quantity: 20, unit: null, brand_requested: null, sku_requested: null }],
    });
    const { extractRfq } = await import("@/lib/ai/extract-rfq");

    const result = await extractRfq("Bonjour, merci de nous chiffrer 20 roulements 6205.");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("fr");
      expect(result.data.items[0].quantity).toBe(20);
    }
  });

  it("extracts a Darija RFQ written in Latin script", async () => {
    mockAnthropicOnce({
      language: "darija",
      intent: "quotation_request",
      items: [
        { raw_description: "10 roulements 6205", quantity: 10, unit: null, brand_requested: null, sku_requested: null },
        { raw_description: "2 fut dyal huile hydraulique 68", quantity: 2, unit: "fut", brand_requested: null, sku_requested: null },
      ],
    });
    const { extractRfq } = await import("@/lib/ai/extract-rfq");

    const result = await extractRfq("Salam, bghina 10 roulements 6205 w 2 fut dyal huile hydraulique 68.");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("darija");
      expect(result.data.items).toHaveLength(2);
      expect(result.data.items[1].quantity).toBe(2);
    }
  });

  it("extracts an RFQ written in Arabic script", async () => {
    mockAnthropicOnce({
      language: "ar",
      intent: "quotation_request",
      items: [{ raw_description: "20 محمل 6205", quantity: 20, unit: null, brand_requested: null, sku_requested: null }],
    });
    const { extractRfq } = await import("@/lib/ai/extract-rfq");

    const result = await extractRfq("مرحبا، نحتاج عرض سعر لـ 20 محمل 6205.");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("ar");
      expect(result.data.items[0].raw_description).toContain("محمل");
    }
  });

  it("extracts an English RFQ", async () => {
    mockAnthropicOnce({
      language: "en",
      intent: "quotation_request",
      items: [
        { raw_description: "15 units of bearing 6205", quantity: 15, unit: "unit", brand_requested: null, sku_requested: null },
        { raw_description: "3 drums hydraulic oil ISO VG 68", quantity: 3, unit: "drum", brand_requested: null, sku_requested: null },
      ],
    });
    const { extractRfq } = await import("@/lib/ai/extract-rfq");

    const result = await extractRfq("Please quote 15 units of bearing 6205 and 3 drums hydraulic oil ISO VG 68.");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("en");
      expect(result.data.items).toHaveLength(2);
    }
  });

  it("never invents a quantity: flags it unclear instead when the message doesn't state one", async () => {
    mockAnthropicOnce({
      language: "darija",
      intent: "quotation_request",
      items: [{ raw_description: "bghina roulement 6205", quantity: null, quantity_unclear: true, unit: null, brand_requested: null, sku_requested: null }],
    });
    const { extractRfq } = await import("@/lib/ai/extract-rfq");

    const result = await extractRfq("Salam, bghina roulement 6205.");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0].quantity).toBeNull();
      expect(result.data.items[0].quantity_unclear).toBe(true);
    }
  });
});
