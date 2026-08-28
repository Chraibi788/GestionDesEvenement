"use client";

import { useActionState } from "react";
import type { Customer } from "@/types/database";
import type { CustomerFormState } from "./actions";

interface Props {
  action: (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
  defaultValues?: Partial<Customer>;
  submitLabel: string;
}

const initialState: CustomerFormState = {};

export default function CustomerForm({ action, defaultValues, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nom" name="name" required defaultValue={defaultValues?.name} error={err("name")} />
        <Field label="Code client" name="customer_code" defaultValue={defaultValues?.customer_code ?? ""} />
        <Field label="Raison sociale" name="legal_name" defaultValue={defaultValues?.legal_name ?? ""} />
        <Field label="ICE" name="ice" defaultValue={defaultValues?.ice ?? ""} />
        <Field label="Email" name="email" type="email" defaultValue={defaultValues?.email ?? ""} error={err("email")} />
        <Field label="Téléphone" name="phone" defaultValue={defaultValues?.phone ?? ""} />
        <Field label="Adresse" name="address" defaultValue={defaultValues?.address ?? ""} />
        <Field label="Ville" name="city" defaultValue={defaultValues?.city ?? ""} />
        <Field
          label="Remise par défaut (%)"
          name="default_discount_percent"
          type="number"
          step="0.01"
          defaultValue={defaultValues?.default_discount_percent ?? 0}
        />
        <Field
          label="Délai de paiement (jours)"
          name="payment_terms_days"
          type="number"
          defaultValue={defaultValues?.payment_terms_days ?? 0}
        />
        <Field
          label="Plafond de crédit (MAD)"
          name="credit_limit"
          type="number"
          step="0.01"
          defaultValue={defaultValues?.credit_limit ?? ""}
        />
      </div>
      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} className="input" defaultValue={defaultValues?.notes ?? ""} />
      </div>
      <div className="flex items-center gap-2">
        <input
          id="is_active"
          name="is_active"
          type="checkbox"
          defaultChecked={defaultValues?.is_active ?? true}
          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
        <label htmlFor="is_active" className="text-sm text-gray-700">Client actif</label>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Enregistrement..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  step,
  required,
  defaultValue,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  step?: string;
  required?: boolean;
  defaultValue?: string | number | null;
  error?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="input"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
