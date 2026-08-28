import Decimal from "decimal.js";
import type { Customer, CustomerProductPrice, Product } from "@/types/database";

export type PricingSource = "special_price" | "customer_product_discount" | "customer_default_discount" | "base_price";

export interface PriceResult {
  base_price: Decimal;
  applied_discount_percent: Decimal;
  net_unit_price: Decimal;
  pricing_source: PricingSource;
}

function isValidToday(row: Pick<CustomerProductPrice, "valid_from" | "valid_until">, asOf: Date): boolean {
  if (row.valid_from && new Date(row.valid_from) > asOf) return false;
  if (row.valid_until && new Date(row.valid_until) < asOf) return false;
  return true;
}

/**
 * Deterministic, database-driven pricing for a single line item. AI never
 * touches this — it only proposes which product matches an RFQ line; the
 * price always comes from here.
 *
 * Priority: customer-specific special_price > customer-specific discount
 * off base_sale_price > customer's default_discount_percent > base_sale_price.
 */
export function calculatePrice(
  product: Pick<Product, "base_sale_price">,
  customer: Pick<Customer, "default_discount_percent"> | null,
  customerProductPrice: Pick<CustomerProductPrice, "special_price" | "discount_percent" | "valid_from" | "valid_until"> | null,
  asOf: Date = new Date()
): PriceResult {
  const basePrice = new Decimal(product.base_sale_price);
  const cppValid = customerProductPrice && isValidToday(customerProductPrice, asOf);

  if (cppValid && customerProductPrice!.special_price != null) {
    const special = new Decimal(customerProductPrice!.special_price);
    const discountPercent = basePrice.isZero() ? new Decimal(0) : basePrice.minus(special).div(basePrice).times(100);
    return {
      base_price: basePrice,
      applied_discount_percent: discountPercent,
      net_unit_price: special,
      pricing_source: "special_price",
    };
  }

  if (cppValid && customerProductPrice!.discount_percent != null) {
    const discountPercent = new Decimal(customerProductPrice!.discount_percent);
    const net = basePrice.times(new Decimal(1).minus(discountPercent.div(100)));
    return {
      base_price: basePrice,
      applied_discount_percent: discountPercent,
      net_unit_price: net,
      pricing_source: "customer_product_discount",
    };
  }

  if (customer && customer.default_discount_percent) {
    const discountPercent = new Decimal(customer.default_discount_percent);
    const net = basePrice.times(new Decimal(1).minus(discountPercent.div(100)));
    return {
      base_price: basePrice,
      applied_discount_percent: discountPercent,
      net_unit_price: net,
      pricing_source: "customer_default_discount",
    };
  }

  return {
    base_price: basePrice,
    applied_discount_percent: new Decimal(0),
    net_unit_price: basePrice,
    pricing_source: "base_price",
  };
}
