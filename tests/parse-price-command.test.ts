import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercises parsePriceCommand() end-to-end with a mocked Claude response —
// this module must NEVER compute a resulting price itself, only extract
// what the salesperson typed. Mirrors the mocking convention used in
// tests/multilingual-extraction.test.ts.

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

describe("parsePriceCommand", () => {
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

  it("parses a discount percent request", async () => {
    mockAnthropicOnce({ intent: "set_discount_percent", product_description: "roulement 6205", value: 10 });
    const { parsePriceCommand } = await import("@/lib/ai/parse-price-command");

    const result = await parsePriceCommand("réduis le prix du roulement 6205 de 10%");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent).toBe("set_discount_percent");
      expect(result.data.product_description).toBe("roulement 6205");
      expect(result.data.value).toBe(10);
    }
  });

  it("parses a fixed special-price request", async () => {
    mockAnthropicOnce({ intent: "set_special_price", product_description: "huile hydraulique ISO VG 68", value: 3000 });
    const { parsePriceCommand } = await import("@/lib/ai/parse-price-command");

    const result = await parsePriceCommand("mets un prix spécial de 3000 dirhams sur l'huile hydraulique ISO VG 68");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent).toBe("set_special_price");
      expect(result.data.value).toBe(3000);
    }
  });

  it("returns unclear when the message doesn't contain an actionable request", async () => {
    mockAnthropicOnce({ intent: "unclear", product_description: null, value: null });
    const { parsePriceCommand } = await import("@/lib/ai/parse-price-command");

    const result = await parsePriceCommand("bonjour, comment ça va ?");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent).toBe("unclear");
      expect(result.data.value).toBeNull();
    }
  });

  it("never invents a value: rejects a response with an out-of-schema shape", async () => {
    mockAnthropicOnce({ intent: "set_discount_percent", product_description: "roulement", value: "dix pourcent" });
    const { parsePriceCommand } = await import("@/lib/ai/parse-price-command");

    const result = await parsePriceCommand("réduis le prix du roulement de dix pourcent");
    expect(result.success).toBe(false);
  });

  it("fails clearly when the AI service is not configured, instead of guessing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { parsePriceCommand } = await import("@/lib/ai/parse-price-command");

    const result = await parsePriceCommand("réduis le prix du roulement 6205 de 10%");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/ANTHROPIC_API_KEY/);
    }
  });
});
