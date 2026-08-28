"use client";

import { useActionState } from "react";
import type { Product } from "@/types/database";
import type { ProductFormState } from "./actions";

interface Props {
  action: (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  defaultValues?: Partial<Product>;
  submitLabel: string;
}

const initialState: ProductFormState = {};

export default function ProductForm({ action, defaultValues, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="SKU" name="sku" required defaultValue={defaultValues?.sku} error={err("sku")} />
        <Field label="Nom" name="name" required defaultValue={defaultValues?.name} error={err("name")} />
        <Field label="Marque" name="brand" defaultValue={defaultValues?.brand ?? ""} />
        <Field label="Catégorie" name="category" defaultValue={defaultValues?.category ?? ""} />
        <Field label="Unité" name="unit" defaultValue={defaultValues?.unit ?? "unit"} />
        <Field label="Conditionnement" name="packaging" defaultValue={defaultValues?.packaging ?? ""} />
        <Field
          label="Prix d'achat (MAD)"
          name="purchase_price"
          type="number"
          step="0.01"
          defaultValue={defaultValues?.purchase_price ?? ""}
          error={err("purchase_price")}
        />
        <Field
          label="Prix de vente (MAD)"
          name="base_sale_price"
          type="number"
          step="0.01"
          required
          defaultValue={defaultValues?.base_sale_price ?? ""}
          error={err("base_sale_price")}
        />
        <Field
          label="Prix de vente minimum (MAD)"
          name="minimum_sale_price"
          type="number"
          step="0.01"
          defaultValue={defaultValues?.minimum_sale_price ?? ""}
        />
        <Field
          label="Stock"
          name="stock_quantity"
          type="number"
          step="0.001"
          defaultValue={defaultValues?.stock_quantity ?? ""}
        />
      </div>
      <div>
        <label className="label" htmlFor="description">Description</label>
        <textarea id="description" name="description" rows={2} className="input" defaultValue={defaultValues?.description ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="technical_keywords">Mots-clés techniques (séparés par des virgules)</label>
        <input
          id="technical_keywords"
          name="technical_keywords"
          className="input"
          placeholder="hydraulic oil, huile hydraulique, ISO VG 68"
          defaultValue={(defaultValues?.technical_keywords ?? []).join(", ")}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          id="is_active"
          name="is_active"
          type="checkbox"
          defaultChecked={defaultValues?.is_active ?? true}
          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
        <label htmlFor="is_active" className="text-sm text-gray-700">Produit actif</label>
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
