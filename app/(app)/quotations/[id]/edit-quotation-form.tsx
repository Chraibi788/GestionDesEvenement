"use client";

import { useActionState } from "react";
import type { Quotation } from "@/types/database";
import { updateQuotationDetailsAction, type EditQuotationDetailsState } from "../actions";

const initialState: EditQuotationDetailsState = {};
const EDITABLE_STATUSES = ["draft", "pending_approval"];

export default function EditQuotationForm({ quotation }: { quotation: Quotation }) {
  const boundAction = updateQuotationDetailsAction.bind(null, quotation.id);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (!EDITABLE_STATUSES.includes(quotation.status)) {
    return null;
  }

  return (
    <div className="card mt-4 p-4">
      <h2 className="text-sm font-semibold text-gray-700">Conditions du devis</h2>
      <form action={formAction} className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="valid_until">Valable jusqu&apos;au</label>
          <input
            id="valid_until"
            name="valid_until"
            type="date"
            defaultValue={quotation.valid_until ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="delivery_terms">Conditions de livraison</label>
          <input id="delivery_terms" name="delivery_terms" defaultValue={quotation.delivery_terms ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="payment_terms">Conditions de paiement</label>
          <input id="payment_terms" name="payment_terms" defaultValue={quotation.payment_terms ?? ""} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" rows={2} defaultValue={quotation.notes ?? ""} className="input" />
        </div>
        {state.error && <p className="text-sm text-red-600 sm:col-span-2">{state.error}</p>}
        <div>
          <button type="submit" disabled={pending} className="btn-secondary">
            {pending ? "Enregistrement..." : "Enregistrer les conditions"}
          </button>
        </div>
      </form>
    </div>
  );
}
