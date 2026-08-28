-- Khedma AI - Quotation financial integrity
--
-- Security review finding: RLS on `quotations`/`quotation_items` enforces
-- tenant isolation (a user can only touch their own company's rows) but,
-- being row-level, it does not stop an authenticated user of that same
-- company from calling the Supabase REST API directly (bypassing the
-- Next.js server action entirely) to rewrite a quotation's total,
-- subtotal, or any line's price/margin — i.e. "price manipulation from
-- the frontend" is possible today for a technically sophisticated user of
-- their own tenant. The application itself never updates these columns
-- after insert (generateQuotationAction only inserts; updateQuotationDetailsAction
-- only ever touches non-financial terms; there is no quotation_items
-- update path at all) — so this migration makes those columns
-- effectively immutable to authenticated clients at the database level,
-- turning an app-level convention into a real guarantee.

-- ------------------------------------------------------------
-- quotations: financial/identity columns are set once at creation and
-- must never change afterwards from a client request. Status transitions
-- (draft/pending_approval/approved/sent/accepted/rejected/expired) and the
-- non-financial terms (valid_until, delivery_terms, payment_terms, notes)
-- remain freely editable by the existing RLS policy + the
-- enforce_quotation_approval_role trigger.
-- ------------------------------------------------------------
create or replace function protect_quotation_financials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.company_id is distinct from old.company_id
     or new.quotation_number is distinct from old.quotation_number
     or new.rfq_id is distinct from old.rfq_id
     or new.customer_id is distinct from old.customer_id
     or new.created_by is distinct from old.created_by
     or new.currency is distinct from old.currency
     or new.subtotal is distinct from old.subtotal
     or new.discount_total is distinct from old.discount_total
     or new.vat_rate is distinct from old.vat_rate
     or new.vat_amount is distinct from old.vat_amount
     or new.total is distinct from old.total
     or new.estimated_margin_percent is distinct from old.estimated_margin_percent
     or new.approval_required is distinct from old.approval_required
  then
    raise exception 'Quotation financial fields cannot be modified after creation';
  end if;

  return new;
end;
$$;

create trigger trg_quotations_protect_financials
  before update on quotations
  for each row execute function protect_quotation_financials();

-- ------------------------------------------------------------
-- quotation_items: the application never updates a line item after
-- insert (correcting a quotation means regenerating it from the RFQ), so
-- lock this table down to insert/select/delete for authenticated users —
-- update is service-role only.
-- ------------------------------------------------------------
create or replace function protect_quotation_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Quotation line items cannot be modified after creation';
  end if;
  return new;
end;
$$;

create trigger trg_quotation_items_protect
  before update on quotation_items
  for each row execute function protect_quotation_items();
