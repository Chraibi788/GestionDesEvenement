import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { matchRfqItem, type MatchableProduct } from "@/lib/matching/match-engine";

const products: MatchableProduct[] = [
  {
    id: "p1",
    sku: "6205",
    name: "Roulement 6205",
    description: null,
    brand: "SKF",
    category: "Roulements",
    packaging: null,
    technical_keywords: null,
  },
  {
    id: "p2",
    sku: "OIL-68",
    name: "Huile hydraulique ISO VG 68",
    description: "Fût 208L",
    brand: "DemoLub",
    category: "Lubrifiants",
    packaging: "208L",
    technical_keywords: ["hydraulic oil", "huile hydraulique", "ISO VG 68", "HLP 68", "hyd 68"],
  },
];

let originalKey: string | undefined;

beforeEach(() => {
  originalKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY; // force the deterministic no-AI fallback path
});

afterEach(() => {
  if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
});

describe("matchRfqItem", () => {
  it("matches on exact SKU with full confidence", async () => {
    const result = await matchRfqItem({ raw_description: "roulement", sku_requested: "6205" }, products);
    expect(result.matched_product_id).toBe("p1");
    expect(result.status).toBe("matched");
    expect(result.match_confidence).toBe(1);
  });

  it("matches on exact product name (case-insensitive)", async () => {
    const result = await matchRfqItem({ raw_description: "huile hydraulique iso vg 68" }, products);
    expect(result.matched_product_id).toBe("p2");
    expect(result.status).toBe("matched");
  });

  it("finds the right product via technical keywords but flags it ambiguous (not auto-matched) when AI is unavailable and the text isn't a perfect match", async () => {
    // "futs" (plural) vs the catalogue's "fut" keeps this just short of a
    // perfect score — correct behavior is to surface it for confirmation
    // rather than silently auto-confirming, exactly like a low-confidence
    // AI-assisted result would.
    const result = await matchRfqItem({ raw_description: "4 futs d'huile hydraulique ISO VG 68 208L" }, products);
    expect(result.matched_product_id).toBe("p2");
    expect(result.status).toBe("ambiguous");
    expect(result.match_confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.match_confidence).toBeLessThan(0.9);
  });

  it("never auto-confirms a weak match: returns unmatched instead of guessing", async () => {
    const result = await matchRfqItem({ raw_description: "clavier sans fil bluetooth" }, products);
    expect(result.matched_product_id).toBeNull();
    expect(result.status).toBe("unmatched");
  });

  it("only ever returns a product id that was in the candidate list", async () => {
    const result = await matchRfqItem({ raw_description: "roulement 6205 skf" }, products);
    if (result.matched_product_id) {
      expect(products.map((p) => p.id)).toContain(result.matched_product_id);
    }
  });
});
