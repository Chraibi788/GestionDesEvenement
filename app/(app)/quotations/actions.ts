"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { createClient } from "@/lib/supabase/server";
import { requireSession, requireRole } from "@/lib/auth/session";
import { callRpc } from "@/lib/supabase/rpc";
import { calculateQuotation, type QuotationLineInput } from "@/lib/pricing/calculate-quotation";
import { evaluateApprovalRequirement } from "@/lib/pricing/margin";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import type { Customer, CustomerProductPrice, Product, RfqItem } from "@/types/database";

export interface GenerateQuotationState {
  error?: string;
}

export async function generateQuotationAction(
  _prevState: GenerateQuotationState,
  formData: FormData
): Promise<GenerateQuotationState> {
  const session = await requireSession();
  const supabase = await createClient();

  const rfqId = String(formData.get("rfq_id") || "");
  const customerId = String(formData.get("customer_id") || "");
  const rfqItemIds = formData.getAll("rfq_item_id").map(String);

  if (!rfqId || !customerId || rfqItemIds.length === 0) {
    return { error: "Données manquantes pour générer le devis." };
  }

  const { data: rfqRow } = await supabase
    .from("rfqs")
    .select("id, status")
    .eq("id", rfqId)
    .eq("company_id", session.company.id)
    .maybeSingle();
  if (!rfqRow) {
    return { error: "Demande de prix introuvable." };
  }

  const { data: customerRow } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("company_id", session.company.id)
    .maybeSingle();
  const customer = customerRow as Customer | null;
  if (!customer) {
    return { error: "Client introuvable." };
  }

  const { data: rfqItemsData } = await supabase
    .from("rfq_items")
    .select("*")
    .in("id", rfqItemIds)
    .eq("rfq_id", rfqId)
    .eq("company_id", session.company.id);
  const rfqItems = (rfqItemsData ?? []) as RfqItem[];

  // Never trust the client for what "matched" means — re-check server-side
  // that every line being quoted actually has a confirmed product match.
  const unmatched = rfqItems.filter((i) => i.status !== "matched" || !i.matched_product_id);
  if (rfqItems.length === 0 || unmatched.length > 0) {
    return { error: "Impossible de générer le devis: certains articles ne sont pas associés à un produit." };
  }

  const productIds = rfqItems.map((i) => i.matched_product_id!) as string[];
  const { data: productsData } = await supabase
    .from("products")
    .select("*")
    .in("id", productIds)
    .eq("company_id", session.company.id);
  const products = (productsData ?? []) as Product[];
  const productById = new Map(products.map((p) => [p.id, p]));

  const { data: cppData } = await supabase
    .from("customer_product_prices")
    .select("*")
    .eq("customer_id", customerId)
    .in("product_id", productIds);
  const customerProductPrices = (cppData ?? []) as CustomerProductPrice[];
  const cppByProduct = new Map(customerProductPrices.map((cpp) => [cpp.product_id, cpp]));

  const quantities: Record<string, number> = {};
  for (const item of rfqItems) {
    const raw = formData.get(`quantity_${item.id}`);
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value <= 0) {
      return { error: `Veuillez saisir une quantité valide pour: ${item.raw_description}` };
    }
    quantities[item.id] = value;
  }

  const lineInputs: QuotationLineInput[] = rfqItems.map((item) => {
    const product = productById.get(item.matched_product_id!)!;
    return {
      product,
      quantity: quantities[item.id],
      description: item.raw_description,
      customerProductPrice: cppByProduct.get(product.id) ?? null,
    };
  });

  const calculation = calculateQuotation(lineInputs, customer, session.company.vat_rate);

  const hasAmbiguousItem = rfqItems.some((i) => (i.match_confidence ?? 1) < 0.9);
  const approval = evaluateApprovalRequirement({
    minimumMarginPercent: session.company.minimum_margin_percent,
    lineMarginsKnown: calculation.lines.map((l) => l.line_margin_percent != null),
    lineMarginPercents: calculation.lines.map((l) => (l.line_margin_percent != null ? new Decimal(l.line_margin_percent) : null)),
    hasAmbiguousItem,
  });

  const { data: quotationNumber, error: numberError } = await callRpc(supabase, "next_quotation_number", {
    p_company_id: session.company.id,
  });
  if (numberError || !quotationNumber) {
    return { error: "Impossible de générer le numéro de devis." };
  }

  const { data: quotationInsert, error: quotationError } = await supabase
    .from("quotations")
    .insert({
      company_id: session.company.id,
      quotation_number: quotationNumber,
      rfq_id: rfqId,
      customer_id: customerId,
      created_by: session.userId,
      status: "pending_approval",
      currency: session.company.currency,
      subtotal: calculation.subtotal,
      discount_total: calculation.discount_total,
      vat_rate: calculation.vat_rate,
      vat_amount: calculation.vat_amount,
      total: calculation.total,
      estimated_margin_percent: calculation.estimated_margin_percent,
      payment_terms: customer.payment_terms_days ? `${customer.payment_terms_days} jours` : null,
      approval_required: approval.approvalRequired,
    })
    .select("id")
    .single();

  if (quotationError || !quotationInsert) {
    return { error: "Impossible d'enregistrer le devis." };
  }

  const quotationId = (quotationInsert as { id: string }).id;

  const { error: itemsError } = await supabase.from("quotation_items").insert(
    calculation.lines.map((line) => ({
      company_id: session.company.id,
      quotation_id: quotationId,
      product_id: line.product_id,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unit_price,
      discount_percent: line.discount_percent,
      net_unit_price: line.net_unit_price,
      line_subtotal: line.line_subtotal,
      purchase_cost: line.purchase_cost,
      line_margin_percent: line.line_margin_percent,
    }))
  );

  if (itemsError) {
    return { error: "Impossible d'enregistrer les lignes du devis." };
  }

  await supabase.from("rfqs").update({ status: "converted" }).eq("id", rfqId);

  await writeAuditLog({
    companyId: session.company.id,
    userId: session.userId,
    action: AUDIT_ACTIONS.QUOTATION_CREATED,
    entityType: "quotation",
    entityId: quotationId,
    metadata: {
      quotation_number: quotationNumber,
      total: calculation.total,
      approval_required: approval.approvalRequired,
      approval_reasons: approval.reasons,
    },
  });

  revalidatePath("/rfqs");
  redirect(`/quotations/${quotationId}`);
}

export interface QuotationDecisionState {
  error?: string;
}

export async function approveQuotationAction(quotationId: string): Promise<QuotationDecisionState> {
  const session = await requireSession();
  try {
    requireRole(session, ["admin", "manager"]);
  } catch {
    return { error: "Seuls les administrateurs et managers peuvent approuver un devis." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotations")
    .update({ status: "approved" })
    .eq("id", quotationId)
    .eq("company_id", session.company.id);

  if (error) {
    return { error: "Impossible d'approuver ce devis." };
  }

  await writeAuditLog({
    companyId: session.company.id,
    userId: session.userId,
    action: AUDIT_ACTIONS.QUOTATION_APPROVED,
    entityType: "quotation",
    entityId: quotationId,
  });

  revalidatePath(`/quotations/${quotationId}`);
  return {};
}

export async function rejectQuotationAction(quotationId: string): Promise<QuotationDecisionState> {
  const session = await requireSession();
  try {
    requireRole(session, ["admin", "manager"]);
  } catch {
    return { error: "Seuls les administrateurs et managers peuvent rejeter un devis." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotations")
    .update({ status: "rejected" })
    .eq("id", quotationId)
    .eq("company_id", session.company.id);

  if (error) {
    return { error: "Impossible de rejeter ce devis." };
  }

  await writeAuditLog({
    companyId: session.company.id,
    userId: session.userId,
    action: AUDIT_ACTIONS.QUOTATION_REJECTED,
    entityType: "quotation",
    entityId: quotationId,
  });

  revalidatePath(`/quotations/${quotationId}`);
  return {};
}

export interface EditQuotationDetailsState {
  error?: string;
}

const EDITABLE_STATUSES = ["draft", "pending_approval"];

/**
 * Lets a salesperson/manager edit the non-financial terms of a quotation
 * (validity date, delivery/payment terms, notes). Prices, quantities, and
 * totals are never editable here — regenerating the RFQ is the only path
 * to changing commercial figures, keeping the calculation always
 * database-derived and auditable.
 */
export async function updateQuotationDetailsAction(
  quotationId: string,
  _prevState: EditQuotationDetailsState,
  formData: FormData
): Promise<EditQuotationDetailsState> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: quotationRow } = await supabase
    .from("quotations")
    .select("id, status")
    .eq("id", quotationId)
    .eq("company_id", session.company.id)
    .maybeSingle();
  if (!quotationRow) {
    return { error: "Devis introuvable." };
  }
  if (!EDITABLE_STATUSES.includes((quotationRow as { status: string }).status)) {
    return { error: "Ce devis ne peut plus être modifié dans son statut actuel." };
  }

  const validUntil = String(formData.get("valid_until") || "").trim() || null;
  const deliveryTerms = String(formData.get("delivery_terms") || "").trim() || null;
  const paymentTerms = String(formData.get("payment_terms") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  const { error } = await supabase
    .from("quotations")
    .update({ valid_until: validUntil, delivery_terms: deliveryTerms, payment_terms: paymentTerms, notes })
    .eq("id", quotationId)
    .eq("company_id", session.company.id);

  if (error) {
    return { error: "Impossible d'enregistrer les modifications." };
  }

  await writeAuditLog({
    companyId: session.company.id,
    userId: session.userId,
    action: AUDIT_ACTIONS.QUOTATION_EDITED,
    entityType: "quotation",
    entityId: quotationId,
  });

  revalidatePath(`/quotations/${quotationId}`);
  return {};
}
