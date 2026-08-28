import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MatchableProduct } from "@/lib/matching/match-engine";

// End-to-end happy path through the deterministic pipeline: Claude
// extraction (mocked, per the spec's instruction to mock Anthropic
// responses) -> product matching -> pricing/margin/quotation calculation
// -> PDF generation -> approval authorization check. This covers what a
// login -> create RFQ -> approve -> download PDF click-through exercises
// at the business-logic level; the actual browser/DB/session parts
// (Supabase Auth, RLS, Next.js Server Actions) require a live Supabase
// project and are documented as a manual/E2E follow-up in the README.

const CANNED_EXTRACTION = {
  language: "fr",
  intent: "quotation_request",
  customer_name: "ABC Industrie",
  requested_delivery: null,
  notes: null,
  items: [
    { raw_description: "20 roulements 6205", quantity: 20, unit: null, brand_requested: null, sku_requested: null },
    {
      raw_description: "4 fûts d'huile hydraulique ISO VG 68",
      quantity: 4,
      unit: "fut",
      brand_requested: null,
      sku_requested: null,
    },
  ],
};

// The RFQ-extraction service and the product-matching service both go
// through the same lib/ai/client.ts Anthropic client, so this single mock
// has to answer both kinds of request correctly — it distinguishes them by
// the (very different) system prompt each service sends, and picks the
// matching-stage response from whichever candidate's name is textually
// contained in the requested item description (mirroring what a real
// ranking call would conclude for this simple fixture).
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockImplementation(async (params: { system: string; messages: { content: string }[] }) => {
          if (params.system.includes("module d'extraction")) {
            return { content: [{ type: "text", text: JSON.stringify(CANNED_EXTRACTION) }] };
          }

          // Matching call: find which candidate's name shares a word with
          // the requested item description and confirm it confidently.
          const userText = params.messages[0].content;
          const candidatesMatch = userText.match(/Candidats \(JSON\):\n([\s\S]*)$/);
          const candidates = candidatesMatch ? JSON.parse(candidatesMatch[1]) : [];
          const requestedMatch = userText.match(/Article demandé: "([^"]+)"/);
          const requestedText = (requestedMatch?.[1] ?? "").toLowerCase();

          const selected = candidates.find((c: { name: string }) =>
            c.name
              .toLowerCase()
              .split(" ")
              .some((word: string) => word.length > 3 && requestedText.includes(word))
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  selected_product_id: selected?.id ?? null,
                  confidence: selected ? 0.95 : 0,
                  reason: selected ? "Correspondance confirmée par l'IA" : "Aucun candidat pertinent",
                  alternatives: [],
                }),
              },
            ],
          };
        }),
      };
    },
  };
});

describe("happy path: paste RFQ -> extract -> match -> price -> PDF -> approve", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    vi.clearAllMocks();
  });

  it("produces the exact demo quotation from a raw customer message", async () => {
    const { extractRfq } = await import("@/lib/ai/extract-rfq");
    const { matchRfqItem } = await import("@/lib/matching/match-engine");
    const { calculateQuotation } = await import("@/lib/pricing/calculate-quotation");
    const { evaluateApprovalRequirement } = await import("@/lib/pricing/margin");
    const { assertAllItemsMatched } = await import("@/lib/quotation/guards");
    const { requireRole } = await import("@/lib/auth/session");

    // 1. AI extraction from the exact message in the spec's acceptance criteria.
    const extraction = await extractRfq(
      "Bonjour, merci de nous chiffrer 20 roulements 6205 et 4 fûts d'huile hydraulique ISO VG 68.",
      "ABC Industrie"
    );
    expect(extraction.success).toBe(true);
    if (!extraction.success) return;
    expect(extraction.data.items).toHaveLength(2);
    expect(extraction.data.items[0].quantity).toBe(20);
    expect(extraction.data.items[1].quantity).toBe(4);

    // 2. Product matching against the seed catalogue (lib/matching/match-engine).
    const products: MatchableProduct[] = [
      { id: "p1", sku: "P001", name: "Roulement 6205", description: null, brand: "SKF", category: "Roulements", packaging: null, technical_keywords: null },
      {
        id: "p3",
        sku: "P003",
        name: "Huile hydraulique ISO VG 68",
        description: null,
        brand: "DemoLub",
        category: "Lubrifiants",
        packaging: "208L",
        technical_keywords: ["hydraulic oil", "huile hydraulique", "ISO VG 68", "HLP 68", "hyd 68"],
      },
    ];

    const matches = await Promise.all(extraction.data.items.map((item) => matchRfqItem(item, products)));
    expect(matches[0].matched_product_id).toBe("p1");
    expect(matches[0].status).toBe("matched");
    expect(matches[1].matched_product_id).toBe("p3");
    expect(matches[1].status).toBe("matched");

    // 3. Quotation cannot be generated unless every item is confirmed matched.
    const guard = assertAllItemsMatched(matches.map((m) => ({ status: m.status, matched_product_id: m.matched_product_id })));
    expect(guard.ok).toBe(true);

    // 4. Deterministic pricing/margin/VAT calculation — ABC Industrie's 7% discount, 20% VAT.
    const calculation = calculateQuotation(
      [
        { product: { id: "p1", base_sale_price: 95, purchase_price: 65, unit: "unit" }, quantity: extraction.data.items[0].quantity!, description: extraction.data.items[0].raw_description },
        { product: { id: "p3", base_sale_price: 3250, purchase_price: 2500, unit: "fut" }, quantity: extraction.data.items[1].quantity!, description: extraction.data.items[1].raw_description },
      ],
      { default_discount_percent: 7 },
      20
    );
    expect(calculation.subtotal).toBeCloseTo(13857, 2);
    expect(calculation.total).toBeCloseTo(16628.4, 2);

    const approval = evaluateApprovalRequirement({
      minimumMarginPercent: 15,
      lineMarginsKnown: calculation.lines.map((l) => l.line_margin_percent != null),
      lineMarginPercents: calculation.lines.map(() => null),
      hasAmbiguousItem: false,
    });
    expect(approval.approvalRequired).toBe(true); // MVP policy: always requires approval

    // 5. Only admin/manager may approve.
    const adminSession = {
      userId: "u1",
      email: "a@a.com",
      profile: { id: "u1", company_id: "c1", full_name: "Admin", role: "admin" as const, phone: null, created_at: "", updated_at: "" },
      company: {
        id: "c1",
        name: "Atlas Industrial Supplies SARL",
        legal_name: null,
        logo_url: null,
        ice: null,
        if_number: null,
        rc: null,
        address: null,
        city: null,
        country: "Morocco",
        phone: null,
        email: null,
        currency: "MAD",
        vat_rate: 20,
        minimum_margin_percent: 15,
        auto_approval_limit: 0,
        created_at: "",
        updated_at: "",
      },
    };
    expect(() => requireRole(adminSession, ["admin", "manager"])).not.toThrow();

    // 6. PDF generation from the final, server-computed figures.
    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { QuotationPdfDocument } = await import("@/lib/pdf/quotation-pdf");
    const buffer = await renderToBuffer(
      QuotationPdfDocument({
        company: adminSession.company,
        customer: {
          id: "cu1",
          company_id: "c1",
          customer_code: null,
          name: "ABC Industrie",
          legal_name: null,
          ice: null,
          email: null,
          phone: null,
          address: null,
          city: null,
          default_discount_percent: 7,
          payment_terms_days: 60,
          credit_limit: null,
          notes: null,
          is_active: true,
          created_at: "",
          updated_at: "",
        },
        quotation: {
          id: "q1",
          company_id: "c1",
          quotation_number: "DV-2026-000001",
          rfq_id: null,
          customer_id: "cu1",
          created_by: null,
          status: "pending_approval",
          currency: "MAD",
          subtotal: calculation.subtotal,
          discount_total: calculation.discount_total,
          vat_rate: calculation.vat_rate,
          vat_amount: calculation.vat_amount,
          total: calculation.total,
          estimated_margin_percent: calculation.estimated_margin_percent,
          valid_until: null,
          delivery_terms: null,
          payment_terms: "60 jours",
          notes: null,
          approval_required: true,
          approved_by: null,
          approved_at: null,
          created_at: "",
          updated_at: "",
        },
        items: calculation.lines.map((l, idx) => ({
          id: `item-${idx}`,
          company_id: "c1",
          quotation_id: "q1",
          product_id: l.product_id,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unit_price: l.unit_price,
          discount_percent: l.discount_percent,
          net_unit_price: l.net_unit_price,
          line_subtotal: l.line_subtotal,
          purchase_cost: l.purchase_cost,
          line_margin_percent: l.line_margin_percent,
          created_at: "",
        })),
      })
    );

    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(500);
  });
});
