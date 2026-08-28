"use client";

import { useActionState } from "react";
import type { Customer } from "@/types/database";
import { createAndAnalyzeRfqAction, type RfqFormState } from "../actions";

const initialState: RfqFormState = {};

export default function RfqForm({ customers }: { customers: Pick<Customer, "id" | "name">[] }) {
  const [state, formAction, pending] = useActionState(createAndAnalyzeRfqAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="customer_id">Client (optionnel)</label>
        <select id="customer_id" name="customer_id" className="input">
          <option value="">-- Non identifié --</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="raw_text">Message du client</label>
        <textarea
          id="raw_text"
          name="raw_text"
          rows={8}
          required
          className="input"
          placeholder="Bonjour, merci de nous faire une offre pour 20 roulements 6205 et 4 fûts d'huile hydraulique ISO VG 68."
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Analyse en cours..." : "Analyser la demande"}
      </button>
    </form>
  );
}
