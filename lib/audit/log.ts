import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditActorType } from "@/types/database";

export const AUDIT_ACTIONS = {
  RFQ_CREATED: "RFQ_CREATED",
  RFQ_AI_EXTRACTED: "RFQ_AI_EXTRACTED",
  PRODUCT_MATCHED: "PRODUCT_MATCHED",
  PRODUCT_MATCH_OVERRIDDEN: "PRODUCT_MATCH_OVERRIDDEN",
  QUOTATION_CREATED: "QUOTATION_CREATED",
  QUOTATION_EDITED: "QUOTATION_EDITED",
  QUOTATION_APPROVED: "QUOTATION_APPROVED",
  QUOTATION_REJECTED: "QUOTATION_REJECTED",
  PDF_GENERATED: "PDF_GENERATED",
  CUSTOMER_CREATED: "CUSTOMER_CREATED",
  CUSTOMER_UPDATED: "CUSTOMER_UPDATED",
  PRODUCT_CREATED: "PRODUCT_CREATED",
  PRODUCT_UPDATED: "PRODUCT_UPDATED",
  PRODUCTS_IMPORTED: "PRODUCTS_IMPORTED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

interface WriteAuditLogParams {
  companyId: string;
  userId?: string | null;
  actorType?: AuditActorType;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Writes an audit_logs row via the service-role client (RLS intentionally
 * has no insert policy for authenticated users on this table). Never pass
 * secrets, API keys, or auth tokens in `metadata`.
 */
export async function writeAuditLog({
  companyId,
  userId = null,
  actorType = "user",
  action,
  entityType,
  entityId = null,
  metadata,
}: WriteAuditLogParams) {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_logs").insert({
    company_id: companyId,
    user_id: userId,
    actor_type: actorType,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: metadata ?? null,
  });

  if (error) {
    // Audit logging must never block the user-facing action it documents.
    console.error("Failed to write audit log", action, entityType, error.message);
  }
}
