// Hand-written types mirroring supabase/migrations/*.sql.
//
// These are used as explicit casts on query results (`data as Customer[]`)
// rather than as a `SupabaseClient<Database>` generic parameter. The
// Database-generic route was tried first but the current
// @supabase/supabase-js + @supabase/postgrest-js generic `GenericSchema`
// resolution is unreliable for a hand-written schema type in this
// TypeScript/library combination (Tables/Functions silently resolve to
// `never` even for a structurally valid schema) — a real project can
// switch to `supabase gen types typescript` output later if desired,
// since call sites here don't depend on the generic.

export type UserRole = "admin" | "manager" | "salesperson";
export type RfqSource = "manual" | "email" | "whatsapp" | "other";
export type RfqStatus = "new" | "processing" | "needs_review" | "processed" | "converted" | "rejected";
export type RfqItemStatus = "matched" | "ambiguous" | "unmatched";
export type QuotationStatus = "draft" | "pending_approval" | "approved" | "sent" | "accepted" | "rejected" | "expired";
export type AuditActorType = "user" | "ai" | "system";

export interface Company {
  id: string;
  name: string;
  legal_name: string | null;
  logo_url: string | null;
  ice: string | null;
  if_number: string | null;
  rc: string | null;
  address: string | null;
  city: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  currency: string;
  vat_rate: number;
  minimum_margin_percent: number;
  auto_approval_limit: number;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  company_id: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  company_id: string;
  customer_code: string | null;
  name: string;
  legal_name: string | null;
  ice: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  default_discount_percent: number;
  payment_terms_days: number;
  credit_limit: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  company_id: string;
  sku: string;
  name: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  unit: string;
  packaging: string | null;
  purchase_price: number | null;
  base_sale_price: number;
  minimum_sale_price: number | null;
  stock_quantity: number | null;
  currency: string;
  technical_keywords: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerProductPrice {
  id: string;
  company_id: string;
  customer_id: string;
  product_id: string;
  special_price: number | null;
  discount_percent: number | null;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface Rfq {
  id: string;
  company_id: string;
  customer_id: string | null;
  created_by: string | null;
  source: RfqSource;
  raw_text: string;
  language: string | null;
  status: RfqStatus;
  ai_confidence: number | null;
  extracted_data: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface RfqItem {
  id: string;
  company_id: string;
  rfq_id: string;
  raw_description: string;
  requested_quantity: number;
  requested_unit: string | null;
  matched_product_id: string | null;
  match_confidence: number | null;
  match_reason: string | null;
  status: RfqItemStatus;
  created_at: string;
}

export interface Quotation {
  id: string;
  company_id: string;
  quotation_number: string;
  rfq_id: string | null;
  customer_id: string;
  created_by: string | null;
  status: QuotationStatus;
  currency: string;
  subtotal: number;
  discount_total: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  estimated_margin_percent: number | null;
  valid_until: string | null;
  delivery_terms: string | null;
  payment_terms: string | null;
  notes: string | null;
  approval_required: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuotationItem {
  id: string;
  company_id: string;
  quotation_id: string;
  product_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_percent: number;
  net_unit_price: number;
  line_subtotal: number;
  purchase_cost: number | null;
  line_margin_percent: number | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  company_id: string;
  user_id: string | null;
  actor_type: AuditActorType;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Names/signatures of the Postgres RPC functions from
// supabase/migrations/0003_business_functions.sql, used by lib/supabase/rpc.ts.
export interface RpcSignatures {
  register_company_and_admin: {
    args: { p_company_name: string; p_full_name: string };
    returns: string;
  };
  next_quotation_number: {
    args: { p_company_id: string };
    returns: string;
  };
  add_team_member: {
    args: { p_user_id: string; p_full_name: string; p_role: UserRole };
    returns: undefined;
  };
}
