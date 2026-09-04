import type { RfqItem } from "@/types/database";

export interface QuotationGuardResult {
  ok: boolean;
  reason?: string;
}

/**
 * A quotation can be generated once every line has *some* confirmed
 * product association — "matched" (>=90% confidence) or "ambiguous"
 * (70-89%, human confirmation recommended) both qualify, per the spec's
 * confidence thresholds: only "unmatched" (<70%, or no product at all)
 * blocks generation outright. An ambiguous item is still allowed through
 * deliberately — it surfaces as a warning and forces approval
 * (lib/pricing/margin.ts's evaluateApprovalRequirement) rather than being
 * silently auto-quoted or blocked entirely.
 *
 * This is deliberately a small, pure, directly-testable function —
 * generateQuotationAction (app/(app)/quotations/actions.ts) calls it as
 * the server-side source of truth, never trusting whatever the client
 * believed was matched.
 */
export function assertAllItemsMatched(
  items: Pick<RfqItem, "status" | "matched_product_id">[]
): QuotationGuardResult {
  if (items.length === 0) {
    return { ok: false, reason: "Aucun article à inclure dans le devis." };
  }

  const unmatched = items.filter((i) => i.status === "unmatched" || !i.matched_product_id);
  if (unmatched.length > 0) {
    return {
      ok: false,
      reason: "Impossible de générer le devis: certains articles ne sont pas associés à un produit.",
    };
  }

  return { ok: true };
}
