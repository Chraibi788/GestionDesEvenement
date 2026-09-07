import Decimal from "decimal.js";
import type { PriceCommand } from "@/lib/ai/parse-price-command";
import { matchRfqItem, type MatchableProduct } from "@/lib/matching/match-engine";
import { calculatePrice } from "@/lib/pricing/calculate-price";
import { calculateMargin } from "@/lib/pricing/margin";
import type { Customer, CustomerProductPrice } from "@/types/database";

export interface PriceCommandProduct extends MatchableProduct {
  base_sale_price: number;
  purchase_price: number | null;
  currency: string;
}

export interface PricePreview {
  product_id: string;
  product_sku: string;
  product_name: string;
  currency: string;
  current_net_price: string;
  current_margin_percent: string | null;
  new_net_price: string;
  new_margin_percent: string | null;
  margin_known: boolean;
  below_minimum_margin: boolean;
  proposed_discount_percent: string | null;
  proposed_special_price: string | null;
}

export type ResolvePriceCommandResult =
  | { status: "unclear"; message: string }
  | { status: "no_match"; message: string }
  | { status: "ambiguous"; message: string; candidates: { product_id: string; sku: string; name: string }[] }
  | { status: "ready"; preview: PricePreview };

/**
 * Deterministically resolves an AI-parsed price command against a
 * company's real catalog and pricing data, and computes a before/after
 * preview using the exact same pricing (lib/pricing/calculate-price.ts) and
 * margin (lib/pricing/margin.ts) engines used for real quotations. Never
 * commits anything — the caller shows this preview and only writes to the
 * database after the user explicitly confirms it.
 */
export async function resolvePriceCommand(
  command: PriceCommand,
  products: PriceCommandProduct[],
  customer: Pick<Customer, "default_discount_percent">,
  existingPrices: Map<string, Pick<CustomerProductPrice, "special_price" | "discount_percent" | "valid_from" | "valid_until">>,
  minimumMarginPercent: number
): Promise<ResolvePriceCommandResult> {
  if (command.intent === "unclear" || command.value == null || !command.product_description) {
    return {
      status: "unclear",
      message:
        "Je n'ai pas compris la demande. Précisez le produit et soit un pourcentage de remise, soit un prix fixe (ex: \"réduis le prix du roulement 6205 de 10%\").",
    };
  }

  if (command.intent === "set_discount_percent" && (command.value < 0 || command.value > 100)) {
    return { status: "unclear", message: "Le pourcentage de remise doit être entre 0 et 100." };
  }
  if (command.intent === "set_special_price" && command.value < 0) {
    return { status: "unclear", message: "Le prix ne peut pas être négatif." };
  }

  const match = await matchRfqItem({ raw_description: command.product_description }, products);

  if (match.status === "unmatched" || !match.matched_product_id) {
    return {
      status: "no_match",
      message: `Aucun produit du catalogue ne correspond à "${command.product_description}". Vérifiez l'orthographe ou choisissez le produit manuellement.`,
    };
  }

  if (match.status === "ambiguous") {
    const candidateIds = [match.matched_product_id, ...match.alternatives.map((a) => a.product_id)];
    const candidates = candidateIds
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is PriceCommandProduct => Boolean(p))
      .map((p) => ({ product_id: p.id, sku: p.sku, name: p.name }));
    return {
      status: "ambiguous",
      message: `Plusieurs produits pourraient correspondre à "${command.product_description}". Lequel voulez-vous dire ?`,
      candidates,
    };
  }

  const product = products.find((p) => p.id === match.matched_product_id);
  if (!product) {
    return { status: "no_match", message: "Produit introuvable dans le catalogue." };
  }

  const existing = existingPrices.get(product.id) ?? null;
  const current = calculatePrice(product, customer, existing);
  const currentMargin = calculateMargin(current.net_unit_price, product.purchase_price);

  const proposedCpp =
    command.intent === "set_special_price"
      ? { special_price: command.value, discount_percent: null, valid_from: null, valid_until: null }
      : { special_price: null, discount_percent: command.value, valid_from: null, valid_until: null };

  const updated = calculatePrice(product, customer, proposedCpp);
  const updatedMargin = calculateMargin(updated.net_unit_price, product.purchase_price);

  const belowMinimum = updatedMargin.margin_known && updatedMargin.margin_percent!.lessThan(minimumMarginPercent);

  return {
    status: "ready",
    preview: {
      product_id: product.id,
      product_sku: product.sku,
      product_name: product.name,
      currency: product.currency,
      current_net_price: current.net_unit_price.toFixed(2),
      current_margin_percent: currentMargin.margin_known ? currentMargin.margin_percent!.toFixed(1) : null,
      new_net_price: updated.net_unit_price.toFixed(2),
      new_margin_percent: updatedMargin.margin_known ? updatedMargin.margin_percent!.toFixed(1) : null,
      margin_known: updatedMargin.margin_known,
      below_minimum_margin: belowMinimum,
      proposed_discount_percent: command.intent === "set_discount_percent" ? new Decimal(command.value).toFixed(2) : null,
      proposed_special_price: command.intent === "set_special_price" ? new Decimal(command.value).toFixed(2) : null,
    },
  };
}
