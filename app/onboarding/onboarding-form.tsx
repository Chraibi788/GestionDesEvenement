"use client";

import { useActionState } from "react";
import { completeOnboardingAction } from "./actions";

export default function OnboardingForm() {
  const [state, formAction, pending] = useActionState(completeOnboardingAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="company_name">Nom de l&apos;entreprise</label>
        <input id="company_name" name="company_name" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="full_name">Votre nom complet</label>
        <input id="full_name" name="full_name" required className="input" />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Création..." : "Continuer"}
      </button>
    </form>
  );
}
