import type { RfqItem } from "@/types/database";

export interface QuotationGuardResult {
  ok: boolean;
  reason?: string;
}

/**
 * A quotation can only be generated once every line has a confirmed
 * product match. This is deliberately a small, pure, directly-testable
 * function — generateQuotationAction (app/(app)/quotations/actions.ts)
 * calls it as the server-side source of truth, never trusting whatever
 * the client believed was matched.
 */
export function assertAllItemsMatched(
  items: Pick<RfqItem, "status" | "matched_product_id">[]
): QuotationGuardResult {
  if (items.length === 0) {
    return { ok: false, reason: "Aucun article à inclure dans le devis." };
  }

  const unmatched = items.filter((i) => i.status !== "matched" || !i.matched_product_id);
  if (unmatched.length > 0) {
    return {
      ok: false,
      reason: "Impossible de générer le devis: certains articles ne sont pas associés à un produit.",
    };
  }

  return { ok: true };
}
