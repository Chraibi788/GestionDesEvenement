"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveQuotationAction, rejectQuotationAction } from "../actions";

export default function QuotationActionsPanel({
  quotationId,
  canApprove,
  status,
}: {
  quotationId: string;
  canApprove: boolean;
  status: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status !== "pending_approval") {
    return null;
  }

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveQuotationAction(quotationId);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectQuotationAction(quotationId);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="card mt-4 p-4">
      <h2 className="text-sm font-semibold text-gray-700">Approbation</h2>
      {!canApprove && (
        <p className="mt-2 text-sm text-gray-500">
          Seuls les administrateurs et managers peuvent approuver ou rejeter ce devis.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {canApprove && (
        <div className="mt-3 flex gap-3">
          <button className="btn-primary" disabled={isPending} onClick={approve}>
            {isPending ? "..." : "Approuver"}
          </button>
          <button className="btn-danger" disabled={isPending} onClick={reject}>
            {isPending ? "..." : "Rejeter"}
          </button>
        </div>
      )}
    </div>
  );
}
