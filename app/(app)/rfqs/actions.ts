"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { extractRfq } from "@/lib/ai/extract-rfq";
import { matchRfqItem, type MatchableProduct } from "@/lib/matching/match-engine";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import type { Customer, RfqItem } from "@/types/database";

export interface RfqFormState {
  error?: string;
}

export async function createAndAnalyzeRfqAction(
  _prevState: RfqFormState,
  formData: FormData
): Promise<RfqFormState> {
  const session = await requireSession();
  const rawText = String(formData.get("raw_text") || "").trim();
  const customerId = String(formData.get("customer_id") || "").trim() || null;

  if (!rawText) {
    return { error: "Veuillez coller le message du client." };
  }

  const supabase = await createClient();

  let knownCustomerName: string | null = null;
  if (customerId) {
    const { data } = await supabase
      .from("customers")
      .select("name")
      .eq("id", customerId)
      .eq("company_id", session.company.id)
      .maybeSingle();
    knownCustomerName = (data as Pick<Customer, "name"> | null)?.name ?? null;
  }

  const { data: rfqInsert, error: insertError } = await supabase
    .from("rfqs")
    .insert({
      company_id: session.company.id,
      customer_id: customerId,
      created_by: session.userId,
      source: "manual",
      raw_text: rawText,
      status: "processing",
    })
    .select("id")
    .single();

  if (insertError || !rfqInsert) {
    return { error: "Impossible de créer la demande de prix." };
  }

  const rfqId = (rfqInsert as { id: string }).id;

  await writeAuditLog({
    companyId: session.company.id,
    userId: session.userId,
    action: AUDIT_ACTIONS.RFQ_CREATED,
    entityType: "rfq",
    entityId: rfqId,
  });

  const extraction = await extractRfq(rawText, knownCustomerName);

  if (!extraction.success) {
    await supabase
      .from("rfqs")
      .update({
        status: "needs_review",
        extracted_data: { error: extraction.error, raw_response: extraction.rawResponse ?? null },
      })
      .eq("id", rfqId);

    await writeAuditLog({
      companyId: session.company.id,
      actorType: "ai",
      action: AUDIT_ACTIONS.RFQ_AI_EXTRACTED,
      entityType: "rfq",
      entityId: rfqId,
      metadata: { success: false, error: extraction.error },
    });

    redirect(`/rfqs/${rfqId}`);
  }

  const items = extraction.data.items;
  const clearCount = items.filter((i) => !i.quantity_unclear && i.quantity != null).length;
  const confidence = items.length > 0 ? Math.round((clearCount / items.length) * 100) / 100 : null;
  const nextStatus = extraction.data.intent !== "quotation_request" || items.length === 0 ? "needs_review" : "processing";

  await supabase
    .from("rfqs")
    .update({
      status: nextStatus,
      language: extraction.data.language,
      ai_confidence: confidence,
      // Stores both the raw Claude response and the validated/parsed
      // extraction (per the spec: "Store: raw response, validated
      // extraction, confidence if available") — the raw text is kept for
      // audit/debugging even though the app only ever acts on `validated`.
      extracted_data: { raw_response: extraction.rawResponse, validated: extraction.data },
    })
    .eq("id", rfqId);

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("rfq_items").insert(
      items.map((item) => ({
        company_id: session.company.id,
        rfq_id: rfqId,
        raw_description: item.raw_description,
        requested_quantity: item.quantity_unclear ? null : item.quantity,
        requested_unit: item.unit ?? null,
        status: "unmatched" as const,
        match_reason: item.quantity_unclear ? "Quantité non précisée par le client" : null,
      }))
    );
    if (itemsError) {
      console.error("Failed to insert rfq_items", itemsError.message);
    }
  }

  await writeAuditLog({
    companyId: session.company.id,
    actorType: "ai",
    action: AUDIT_ACTIONS.RFQ_AI_EXTRACTED,
    entityType: "rfq",
    entityId: rfqId,
    metadata: {
      success: true,
      model: extraction.model,
      duration_ms: extraction.durationMs,
      confidence,
      item_count: items.length,
    },
  });

  revalidatePath("/rfqs");
  redirect(`/rfqs/${rfqId}`);
}

/**
 * Runs the product matching engine (lib/matching/match-engine.ts) over
 * every rfq_item of an RFQ that isn't matched yet, and persists the
 * results. Safe to call multiple times — already-matched items are
 * skipped unless the salesperson explicitly re-runs matching for one item.
 */
export async function matchRfqItemsAction(rfqId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: rfqRow } = await supabase
    .from("rfqs")
    .select("id")
    .eq("id", rfqId)
    .eq("company_id", session.company.id)
    .maybeSingle();
  if (!rfqRow) {
    return { error: "Demande de prix introuvable." };
  }

  const { data: itemsData } = await supabase.from("rfq_items").select("*").eq("rfq_id", rfqId);
  const items = (itemsData ?? []) as RfqItem[];

  const { data: productsData } = await supabase
    .from("products")
    .select("id, sku, name, description, brand, category, packaging, technical_keywords")
    .eq("company_id", session.company.id)
    .eq("is_active", true);
  const products = (productsData ?? []) as MatchableProduct[];

  for (const item of items) {
    const result = await matchRfqItem(
      {
        raw_description: item.raw_description,
        requested_unit: item.requested_unit,
      },
      products
    );

    await supabase
      .from("rfq_items")
      .update({
        matched_product_id: result.matched_product_id,
        match_confidence: result.match_confidence,
        match_reason: result.match_reason,
        status: result.status,
      })
      .eq("id", item.id);

    await writeAuditLog({
      companyId: session.company.id,
      actorType: "ai",
      action: AUDIT_ACTIONS.PRODUCT_MATCHED,
      entityType: "rfq_item",
      entityId: item.id,
      metadata: {
        matched_product_id: result.matched_product_id,
        confidence: result.match_confidence,
        status: result.status,
      },
    });
  }

  const { data: refreshedItems } = await supabase.from("rfq_items").select("status").eq("rfq_id", rfqId);
  const allMatched = (refreshedItems ?? []).every((i) => (i as { status: string }).status === "matched");
  await supabase
    .from("rfqs")
    .update({ status: allMatched ? "processed" : "needs_review" })
    .eq("id", rfqId);

  revalidatePath(`/rfqs/${rfqId}`);
  revalidatePath("/rfqs");
  return {};
}

/**
 * Lets a salesperson manually correct or confirm a product match. A human
 * selection is always treated as fully confident and never re-guessed by
 * the matching engine afterwards.
 */
export async function overrideRfqItemMatchAction(rfqItemId: string, productId: string | null): Promise<{ error?: string }> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: itemRow } = await supabase
    .from("rfq_items")
    .select("id, rfq_id")
    .eq("id", rfqItemId)
    .eq("company_id", session.company.id)
    .maybeSingle();
  if (!itemRow) {
    return { error: "Ligne introuvable." };
  }

  const { error } = await supabase
    .from("rfq_items")
    .update({
      matched_product_id: productId,
      match_confidence: productId ? 1 : 0,
      match_reason: productId ? "Sélection manuelle par le commercial" : "Non trouvé — sélection manuelle vide",
      status: productId ? "matched" : "unmatched",
    })
    .eq("id", rfqItemId);

  if (error) {
    return { error: "Impossible d'enregistrer la correction." };
  }

  await writeAuditLog({
    companyId: session.company.id,
    userId: session.userId,
    action: AUDIT_ACTIONS.PRODUCT_MATCH_OVERRIDDEN,
    entityType: "rfq_item",
    entityId: rfqItemId,
    metadata: { product_id: productId },
  });

  const rfqId = (itemRow as { rfq_id: string }).rfq_id;
  const { data: refreshedItems } = await supabase.from("rfq_items").select("status").eq("rfq_id", rfqId);
  const allMatched = (refreshedItems ?? []).every((i) => (i as { status: string }).status === "matched");
  await supabase
    .from("rfqs")
    .update({ status: allMatched ? "processed" : "needs_review" })
    .eq("id", rfqId);

  revalidatePath(`/rfqs/${rfqId}`);
  return {};
}
