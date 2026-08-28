"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { customerSchema } from "@/lib/validation/schemas";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";

export interface CustomerFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parseCustomerForm(formData: FormData) {
  const raw = {
    customer_code: formData.get("customer_code"),
    name: formData.get("name"),
    legal_name: formData.get("legal_name"),
    ice: formData.get("ice"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    city: formData.get("city"),
    default_discount_percent: formData.get("default_discount_percent") || "0",
    payment_terms_days: formData.get("payment_terms_days") || "0",
    credit_limit: formData.get("credit_limit"),
    notes: formData.get("notes"),
    is_active: formData.get("is_active") === "on",
  };

  return customerSchema.safeParse(raw);
}

export async function createCustomerAction(
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const session = await requireSession();
  const parsed = parseCustomerForm(formData);

  if (!parsed.success) {
    return { error: "Veuillez corriger les champs invalides.", fieldErrors: flattenIssues(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ ...parsed.data, company_id: session.company.id })
    .select("id")
    .single();

  if (error) {
    return { error: describeDbError(error.message) };
  }

  await writeAuditLog({
    companyId: session.company.id,
    userId: session.userId,
    action: AUDIT_ACTIONS.CUSTOMER_CREATED,
    entityType: "customer",
    entityId: (data as { id: string }).id,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/customers");
  redirect("/customers");
}

export async function updateCustomerAction(
  customerId: string,
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const session = await requireSession();
  const parsed = parseCustomerForm(formData);

  if (!parsed.success) {
    return { error: "Veuillez corriger les champs invalides.", fieldErrors: flattenIssues(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update(parsed.data)
    .eq("id", customerId)
    .eq("company_id", session.company.id);

  if (error) {
    return { error: describeDbError(error.message) };
  }

  await writeAuditLog({
    companyId: session.company.id,
    userId: session.userId,
    action: AUDIT_ACTIONS.CUSTOMER_UPDATED,
    entityType: "customer",
    entityId: customerId,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  redirect("/customers");
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
  if (message.includes("uq_customers_company_code")) {
    return "Ce code client est déjà utilisé.";
  }
  return "Une erreur est survenue lors de l'enregistrement.";
}
