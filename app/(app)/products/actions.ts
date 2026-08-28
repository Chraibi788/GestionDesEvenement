"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { productSchema } from "@/lib/validation/schemas";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";

export interface ProductFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parseProductForm(formData: FormData) {
  const raw = {
    sku: formData.get("sku"),
    name: formData.get("name"),
    description: formData.get("description"),
    brand: formData.get("brand"),
    category: formData.get("category"),
    unit: formData.get("unit") || "unit",
    packaging: formData.get("packaging"),
    purchase_price: formData.get("purchase_price"),
    base_sale_price: formData.get("base_sale_price"),
    minimum_sale_price: formData.get("minimum_sale_price"),
    stock_quantity: formData.get("stock_quantity"),
    currency: formData.get("currency") || "MAD",
    technical_keywords: formData.get("technical_keywords") || "",
    is_active: formData.get("is_active") === "on",
  };

  return productSchema.safeParse(raw);
}

export async function createProductAction(
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const session = await requireSession();
  const parsed = parseProductForm(formData);

  if (!parsed.success) {
    return { error: "Veuillez corriger les champs invalides.", fieldErrors: flattenIssues(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({ ...parsed.data, company_id: session.company.id })
    .select("id")
    .single();

  if (error) {
    return { error: describeDbError(error.message) };
  }

  await writeAuditLog({
    companyId: session.company.id,
    userId: session.userId,
    action: AUDIT_ACTIONS.PRODUCT_CREATED,
    entityType: "product",
    entityId: (data as { id: string }).id,
    metadata: { sku: parsed.data.sku, name: parsed.data.name },
  });

  revalidatePath("/products");
  redirect("/products");
}

export async function updateProductAction(
  productId: string,
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const session = await requireSession();
  const parsed = parseProductForm(formData);

  if (!parsed.success) {
    return { error: "Veuillez corriger les champs invalides.", fieldErrors: flattenIssues(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update(parsed.data)
    .eq("id", productId)
    .eq("company_id", session.company.id);

  if (error) {
    return { error: describeDbError(error.message) };
  }

  await writeAuditLog({
    companyId: session.company.id,
    userId: session.userId,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entityType: "product",
    entityId: productId,
    metadata: { sku: parsed.data.sku, name: parsed.data.name },
  });

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  redirect("/products");
}

function flattenIssues(error: ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function describeDbError(message: string) {
  if (message.includes("uq_products_company_sku")) {
    return "Ce SKU est déjà utilisé.";
  }
  return "Une erreur est survenue lors de l'enregistrement.";
}
