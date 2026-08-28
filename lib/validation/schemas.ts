import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional();

const numberFromInput = (opts?: { min?: number }) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? (v.trim() === "" ? null : Number(v)) : v))
    .nullable()
    .optional()
    .refine((v) => v === null || v === undefined || Number.isFinite(v), { message: "Nombre invalide" })
    .refine((v) => v === null || v === undefined || opts?.min === undefined || v >= opts.min, {
      message: `Doit être supérieur ou égal à ${opts?.min}`,
    });

export const customerSchema = z.object({
  customer_code: optionalText,
  name: z.string().trim().min(1, "Le nom est requis"),
  legal_name: optionalText,
  ice: optionalText,
  email: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional()
    .refine((v) => v === null || v === undefined || z.string().email().safeParse(v).success, {
      message: "Email invalide",
    }),
  phone: optionalText,
  address: optionalText,
  city: optionalText,
  default_discount_percent: z.coerce.number().min(0).max(100).default(0),
  payment_terms_days: z.coerce.number().int().min(0).default(0),
  credit_limit: numberFromInput({ min: 0 }),
  notes: optionalText,
  is_active: z.coerce.boolean().default(true),
});

export type CustomerInput = z.infer<typeof customerSchema>;

export const productSchema = z.object({
  sku: z.string().trim().min(1, "Le SKU est requis"),
  name: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  brand: optionalText,
  category: optionalText,
  unit: z.string().trim().min(1).default("unit"),
  packaging: optionalText,
  purchase_price: numberFromInput({ min: 0 }),
  base_sale_price: z.coerce.number().min(0, "Doit être positif"),
  minimum_sale_price: numberFromInput({ min: 0 }),
  stock_quantity: numberFromInput({ min: 0 }),
  currency: z.string().trim().min(1).default("MAD"),
  technical_keywords: z
    .union([z.string(), z.array(z.string())])
    .transform((v) =>
      Array.isArray(v)
        ? v.map((k) => k.trim()).filter(Boolean)
        : v
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean)
    )
    .optional(),
  is_active: z.coerce.boolean().default(true),
});

export type ProductInput = z.infer<typeof productSchema>;

// One row from a CSV/XLSX product import, before DB coercion.
export const productImportRowSchema = z.object({
  sku: z.string().trim().min(1, "SKU manquant"),
  name: z.string().trim().min(1, "Nom manquant"),
  description: optionalText,
  brand: optionalText,
  category: optionalText,
  unit: optionalText,
  packaging: optionalText,
  purchase_price: numberFromInput({ min: 0 }),
  base_sale_price: z.coerce.number({ error: "Prix de vente invalide" }).min(0, "Le prix ne peut pas être négatif"),
  minimum_sale_price: numberFromInput({ min: 0 }),
  stock_quantity: numberFromInput({ min: 0 }),
  technical_keywords: optionalText,
});

export type ProductImportRow = z.infer<typeof productImportRowSchema>;
