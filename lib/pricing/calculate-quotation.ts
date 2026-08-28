import Decimal from "decimal.js";
import { calculatePrice, type PricingSource } from "./calculate-price";
import { calculateMargin } from "./margin";
import type { Customer, CustomerProductPrice, Product } from "@/types/database";

export interface QuotationLineInput {
  product: Pick<Product, "id" | "base_sale_price" | "purchase_price" | "unit">;
  quantity: number;
  description: string;
  customerProductPrice?: Pick<CustomerProductPrice, "special_price" | "discount_percent" | "valid_from" | "valid_until"> | null;
}

export interface QuotationLineResult {
  product_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_percent: number;
  net_unit_price: number;
  line_subtotal: number;
  purchase_cost: number | null;
  line_margin_percent: number | null;
  pricing_source: PricingSource;
}

export interface QuotationCalculation {
  lines: QuotationLineResult[];
  subtotal: number;
  discount_total: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  estimated_margin_percent: number | null;
}

function round2(value: Decimal): number {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Computes a full quotation deterministically from database-sourced values
 * only (product prices, customer discounts, company VAT rate). AI never
 * participates in this calculation — see lib/pricing/calculate-price.ts and
 * lib/pricing/margin.ts for the individual building blocks this composes.
 */
export function calculateQuotation(
  lineInputs: QuotationLineInput[],
  customer: Pick<Customer, "default_discount_percent"> | null,
  vatRatePercent: number,
  asOf: Date = new Date()
): QuotationCalculation {
  let subtotal = new Decimal(0);
  let discountTotal = new Decimal(0);
  let marginAmountTotal = new Decimal(0);
  let allMarginsKnown = true;

  const lines: QuotationLineResult[] = lineInputs.map((input) => {
    const quantity = new Decimal(input.quantity);
    const pricing = calculatePrice(input.product, customer, input.customerProductPrice ?? null, asOf);
    const lineSubtotal = round2(pricing.net_unit_price.times(quantity));
    const lineDiscountAmount = pricing.base_price.minus(pricing.net_unit_price).times(quantity);

    subtotal = subtotal.plus(lineSubtotal);
    discountTotal = discountTotal.plus(lineDiscountAmount);

    const margin = calculateMargin(pricing.net_unit_price, input.product.purchase_price);
    if (!margin.margin_known) {
      allMarginsKnown = false;
    } else {
      marginAmountTotal = marginAmountTotal.plus(margin.margin_amount!.times(quantity));
    }

    return {
      product_id: input.product.id,
      description: input.description,
      quantity: input.quantity,
      unit: input.product.unit,
      unit_price: round2(pricing.base_price),
      discount_percent: pricing.applied_discount_percent.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      net_unit_price: round2(pricing.net_unit_price),
      line_subtotal: lineSubtotal,
      purchase_cost: input.product.purchase_price,
      line_margin_percent: margin.margin_known ? round2(margin.margin_percent!) : null,
      pricing_source: pricing.pricing_source,
    };
  });

  const vatAmount = subtotal.times(vatRatePercent).div(100);
  const total = subtotal.plus(vatAmount);

  const estimatedMarginPercent = allMarginsKnown && subtotal.greaterThan(0) ? round2(marginAmountTotal.div(subtotal).times(100)) : null;

  return {
    lines,
    subtotal: round2(subtotal),
    discount_total: round2(discountTotal),
    vat_rate: vatRatePercent,
    vat_amount: round2(vatAmount),
    total: round2(total),
    estimated_margin_percent: estimatedMarginPercent,
  };
}
