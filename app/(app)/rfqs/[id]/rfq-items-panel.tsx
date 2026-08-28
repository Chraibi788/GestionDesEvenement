"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { RfqItem, RfqStatus } from "@/types/database";
import { matchRfqItemsAction, overrideRfqItemMatchAction } from "../actions";

type ProductOption = { id: string; sku: string; name: string; brand: string | null; base_sale_price: number };
type ItemWithProduct = RfqItem & { products: { id: string; sku: string; name: string; base_sale_price: number } | null };

export default function RfqItemsPanel({
  rfqId,
  rfqStatus,
  customerId,
  items,
  products,
}: {
  rfqId: string;
  rfqStatus: RfqStatus;
  customerId: string | null;
  items: ItemWithProduct[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasUnprocessedItems = items.some((i) => i.status !== "matched" && i.match_confidence == null);
  const allMatched = items.length > 0 && items.every((i) => i.status === "matched");
  const hasUnmatched = items.some((i) => i.status === "unmatched");

  function runMatching() {
    setError(null);
    startTransition(async () => {
      const result = await matchRfqItemsAction(rfqId);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function overrideMatch(itemId: string, productId: string) {
    setError(null);
    startTransition(async () => {
      const result = await overrideRfqItemMatchAction(itemId, productId || null);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="card mt-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">
          Articles extraits <span className="ml-2 text-xs font-normal text-gray-400">({rfqStatus})</span>
        </h2>
        {hasUnprocessedItems && items.length > 0 && (
          <button className="btn-secondary" disabled={isPending} onClick={runMatching}>
            {isPending ? "Analyse en cours..." : "Rechercher les produits correspondants"}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">
          Aucun article détecté dans ce message (peut-être n&apos;est-ce pas une demande de devis, ou la quantité était
          totalement absente).
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Description</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Quantité</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Produit suggéré</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Confiance</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Corriger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2 text-gray-700">{item.raw_description}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {item.requested_quantity ?? <span className="text-amber-600">non précisée</span>} {item.requested_unit ?? ""}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {item.products ? (
                      <span>
                        {item.products.name} <span className="text-xs text-gray-400">({item.products.sku})</span>
                      </span>
                    ) : item.match_confidence != null ? (
                      <span className="text-gray-400">Aucune correspondance</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ConfidenceBadge confidence={item.match_confidence} reason={item.match_reason} />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="input"
                      value={item.matched_product_id ?? ""}
                      onChange={(e) => overrideMatch(item.id, e.target.value)}
                      disabled={isPending}
                    >
                      <option value="">-- Choisir manuellement --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <a
            href={allMatched ? `/quotations/generate?rfq_id=${rfqId}` : undefined}
            className={`btn-primary ${!allMatched ? "pointer-events-none opacity-50" : ""}`}
            aria-disabled={!allMatched}
          >
            Générer le devis
          </a>
          {hasUnmatched && (
            <p className="text-xs text-amber-600">
              Au moins un article n&apos;est pas encore associé à un produit — corrigez-le manuellement avant de générer le
              devis.
            </p>
          )}
        </div>
      )}
      {!customerId && items.length > 0 && (
        <p className="mt-2 text-xs text-amber-600">
          Aucun client n&apos;est associé à cette demande — un client devra être sélectionné avant de générer le devis.
        </p>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence, reason }: { confidence: number | null; reason: string | null }) {
  if (confidence == null) {
    return <span className="text-xs text-gray-400">En attente</span>;
  }
  const pct = Math.round(confidence * 100);
  const cls = pct >= 90 ? "badge-green" : pct >= 70 ? "badge-orange" : "badge-red";
  return (
    <div>
      <span className={cls}>{pct}%</span>
      {reason && <p className="mt-1 max-w-xs text-xs text-gray-400">{reason}</p>}
    </div>
  );
}
