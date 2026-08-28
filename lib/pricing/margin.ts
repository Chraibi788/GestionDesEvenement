import Decimal from "decimal.js";

export interface MarginResult {
  margin_amount: Decimal | null;
  margin_percent: Decimal | null;
  margin_known: boolean;
}

/**
 * margin = net selling price - purchase cost; percent is margin / net
 * selling price. If purchase cost is unavailable, margin is explicitly
 * unknown (never assumed to be zero or acceptable) so the caller can force
 * human approval.
 */
export function calculateMargin(netUnitPrice: Decimal, purchaseCost: number | null): MarginResult {
  if (purchaseCost == null) {
    return { margin_amount: null, margin_percent: null, margin_known: false };
  }

  const cost = new Decimal(purchaseCost);
  const marginAmount = netUnitPrice.minus(cost);
  const marginPercent = netUnitPrice.isZero() ? new Decimal(0) : marginAmount.div(netUnitPrice).times(100);

  return { margin_amount: marginAmount, margin_percent: marginPercent, margin_known: true };
}

export interface ApprovalCheckInput {
  minimumMarginPercent: number;
  lineMarginsKnown: boolean[];
  lineMarginPercents: (Decimal | null)[];
  hasAmbiguousItem: boolean;
}

export interface ApprovalCheckResult {
  approvalRequired: boolean;
  reasons: string[];
}

/**
 * Decides whether a quotation needs human approval before it can be sent.
 * For this MVP every generated quotation requires approval by default
 * (see companies.auto_approval_limit / future roadmap), but the specific
 * reasons are still surfaced so the reviewer knows what to check.
 */
export function evaluateApprovalRequirement(input: ApprovalCheckInput): ApprovalCheckResult {
  const reasons: string[] = [];

  if (input.lineMarginsKnown.some((known) => !known)) {
    reasons.push("Le prix d'achat est absent pour au moins un article — marge inconnue.");
  }

  const belowThreshold = input.lineMarginPercents.some(
    (pct) => pct != null && pct.lessThan(input.minimumMarginPercent)
  );
  if (belowThreshold) {
    reasons.push(`Marge inférieure au seuil minimum autorisé (${input.minimumMarginPercent}%).`);
  }

  if (input.hasAmbiguousItem) {
    reasons.push("Au moins un produit a été identifié avec une confiance modérée — vérification recommandée.");
  }

  // MVP policy: every quotation requires human approval regardless of the
  // reasons above (see companies.auto_approval_limit for the future
  // automatic-approval roadmap item). Reasons are still returned so the
  // reviewer sees what to check.
  return { approvalRequired: true, reasons };
}
