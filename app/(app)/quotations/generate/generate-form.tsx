"use client";

import { useActionState, useMemo, useState } from "react";
import { calculateQuotation, type QuotationLineInput } from "@/lib/pricing/calculate-quotation";
import { evaluateApprovalRequirement } from "@/lib/pricing/margin";
import Decimal from "decimal.js";
import type { CustomerProductPrice } from "@/types/database";
import { generateQuotationAction, type GenerateQuotationState } from "../actions";

interface LineProps {
  rfqItemId: string;
  description: string;
  requestedQuantity: number | null;
  matchConfidence: number | null;
  product: { id: string; unit: string; base_sale_price: number; purchase_price: number | null };
  customerProductPrice: CustomerProductPrice | null;
}

const initialState: GenerateQuotationState = {};

export default function GenerateQuotationForm({
  rfqId,
  customerId,
  customerDefaultDiscountPercent,
  vatRatePercent,
  minimumMarginPercent,
  lines,
}: {
  rfqId: string;
  customerId: string;
  customerDefaultDiscountPercent: number;
  vatRatePercent: number;
  minimumMarginPercent: number;
  lines: LineProps[];
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.rfqItemId, l.requestedQuantity != null ? String(l.requestedQuantity) : ""]))
  );
  const [state, formAction, pending] = useActionState(generateQuotationAction, initialState);

  const parsedQuantities = useMemo(
    () => Object.fromEntries(lines.map((l) => [l.rfqItemId, Number(quantities[l.rfqItemId])])),
    [quantities, lines]
  );
  const allQuantitiesValid = lines.every((l) => Number.isFinite(parsedQuantities[l.rfqItemId]) && parsedQuantities[l.rfqItemId] > 0);

  const calculation = useMemo(() => {
    const lineInputs: QuotationLineInput[] = lines.map((l) => ({
      product: l.product,
      quantity: Number.isFinite(parsedQuantities[l.rfqItemId]) && parsedQuantities[l.rfqItemId] > 0 ? parsedQuantities[l.rfqItemId] : 0,
      description: l.description,
      customerProductPrice: l.customerProductPrice,
    }));
    return calculateQuotation(lineInputs, { default_discount_percent: customerDefaultDiscountPercent }, vatRatePercent);
  }, [lines, parsedQuantities, customerDefaultDiscountPercent, vatRatePercent]);

  const hasAmbiguousItem = lines.some((l) => (l.matchConfidence ?? 1) < 0.9);
  const approval = evaluateApprovalRequirement({
    minimumMarginPercent,
    lineMarginsKnown: calculation.lines.map((l) => l.line_margin_percent != null),
    lineMarginPercents: calculation.lines.map((l) => (l.line_margin_percent != null ? new Decimal(l.line_margin_percent) : null)),
    hasAmbiguousItem,
  });

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <input type="hidden" name="rfq_id" value={rfqId} />
      <input type="hidden" name="customer_id" value={customerId} />
      {lines.map((l) => (
        <input key={l.rfqItemId} type="hidden" name="rfq_item_id" value={l.rfqItemId} />
      ))}

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Description</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Quantité</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Prix unitaire</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Remise</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Prix net</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Sous-total</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Marge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {lines.map((l, idx) => {
              const calcLine = calculation.lines[idx];
              return (
                <tr key={l.rfqItemId}>
                  <td className="px-3 py-2 text-gray-700">{l.description}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      name={`quantity_${l.rfqItemId}`}
                      min="0.001"
                      step="0.001"
                      required
                      value={quantities[l.rfqItemId]}
                      onChange={(e) => setQuantities((q) => ({ ...q, [l.rfqItemId]: e.target.value }))}
                      className="input w-24"
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-600">{calcLine.unit_price.toFixed(2)}</td>
                  <td className="px-3 py-2 text-gray-600">{calcLine.discount_percent.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-gray-600">{calcLine.net_unit_price.toFixed(2)}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{calcLine.line_subtotal.toFixed(2)}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {calcLine.line_margin_percent != null ? `${calcLine.line_margin_percent.toFixed(1)}%` : "Inconnue"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <SummaryStat label="Sous-total HT" value={`${calculation.subtotal.toFixed(2)} MAD`} />
        <SummaryStat label="Remise totale" value={`${calculation.discount_total.toFixed(2)} MAD`} />
        <SummaryStat label={`TVA (${calculation.vat_rate}%)`} value={`${calculation.vat_amount.toFixed(2)} MAD`} />
        <SummaryStat label="Total TTC" value={`${calculation.total.toFixed(2)} MAD`} emphasize />
      </div>

      {approval.reasons.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">Ce devis nécessitera une approbation:</p>
          <ul className="mt-1 list-inside list-disc text-sm text-amber-700">
            {approval.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button type="submit" disabled={pending || !allQuantitiesValid} className="btn-primary">
        {pending ? "Génération en cours..." : "Générer le devis"}
      </button>
    </form>
  );
}

function SummaryStat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className={emphasize ? "text-lg font-bold text-brand-700" : "text-base font-medium text-gray-800"}>{value}</p>
    </div>
  );
}
