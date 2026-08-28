-- Khedma AI - Row Level Security
-- Tenant isolation is enforced in Postgres, never only in the frontend.

-- ------------------------------------------------------------
-- Helper functions (SECURITY DEFINER, STABLE) used inside policies
-- ------------------------------------------------------------
create or replace function app_current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from profiles where id = auth.uid();
$$;

create or replace function app_current_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function app_is_admin_or_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app_current_role() in ('admin', 'manager'), false);
$$;

-- ------------------------------------------------------------
-- companies
-- ------------------------------------------------------------
alter table companies enable row level security;

create policy companies_select on companies
  for select
  using (id = app_current_company_id());

-- Only admins can edit their own company's settings.
create policy companies_update on companies
  for update
  using (id = app_current_company_id() and app_current_role() = 'admin')
  with check (id = app_current_company_id());

-- No insert/delete policy for authenticated users: company creation goes
-- through the SECURITY DEFINER register_company_and_admin() function only.

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
alter table profiles enable row level security;

create policy profiles_select on profiles
  for select
  using (company_id = app_current_company_id() or id = auth.uid());

-- Users may edit their own row (name/phone). company_id and role changes
-- are blocked by the trigger below regardless of this policy.
create policy profiles_update on profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- No insert/delete policy for authenticated users: profile creation goes
-- through the SECURITY DEFINER register_company_and_admin() function, or
-- an admin-only invite RPC, both of which bypass RLS intentionally.

-- Prevent privilege escalation: a user must never be able to change their
-- own company_id or role via a direct table update, even though they can
-- update their own row for name/phone.
create or replace function prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.company_id is distinct from old.company_id or new.role is distinct from old.role)
     and auth.role() <> 'service_role' then
    raise exception 'Changing company_id or role is not allowed from client requests';
  end if;
  return new;
end;
$$;

create trigger trg_profiles_prevent_escalation
  before update on profiles
  for each row execute function prevent_profile_privilege_escalation();

-- ------------------------------------------------------------
-- Generic tenant policies for company-owned tables
-- ------------------------------------------------------------
alter table customers enable row level security;
create policy customers_all on customers
  for all
  using (company_id = app_current_company_id())
  with check (company_id = app_current_company_id());

alter table products enable row level security;
create policy products_all on products
  for all
  using (company_id = app_current_company_id())
  with check (company_id = app_current_company_id());

alter table customer_product_prices enable row level security;
create policy customer_product_prices_all on customer_product_prices
  for all
  using (company_id = app_current_company_id())
  with check (company_id = app_current_company_id());

alter table rfqs enable row level security;
create policy rfqs_all on rfqs
  for all
  using (company_id = app_current_company_id())
  with check (company_id = app_current_company_id());

alter table rfq_items enable row level security;
create policy rfq_items_all on rfq_items
  for all
  using (company_id = app_current_company_id())
  with check (company_id = app_current_company_id());

alter table quotations enable row level security;
create policy quotations_select on quotations
  for select
  using (company_id = app_current_company_id());
create policy quotations_insert on quotations
  for insert
  with check (company_id = app_current_company_id());
create policy quotations_update on quotations
  for update
  using (company_id = app_current_company_id())
  with check (company_id = app_current_company_id());
-- Deletion of quotations is intentionally not allowed from the client
-- (they are cancelled/rejected instead, to preserve the audit trail).

alter table quotation_items enable row level security;
create policy quotation_items_all on quotation_items
  for all
  using (company_id = app_current_company_id())
  with check (company_id = app_current_company_id());

alter table audit_logs enable row level security;
create policy audit_logs_select on audit_logs
  for select
  using (company_id = app_current_company_id());
-- Inserts into audit_logs happen via the service role (server-side actions
-- only) so there is intentionally no insert policy for authenticated users.

alter table company_quotation_counters enable row level security;
create policy company_quotation_counters_select on company_quotation_counters
  for select
  using (company_id = app_current_company_id());
-- No direct insert/update policy: only the SECURITY DEFINER
-- next_quotation_number() function may mutate this table.

-- Only admins/managers may move a quotation into 'approved'. Enforced
-- server-side in application code too, but defended here as well.
create or replace function enforce_quotation_approval_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    if auth.role() <> 'service_role' and not app_is_admin_or_manager() then
      raise exception 'Only admin or manager roles may approve quotations';
    end if;
    new.approved_by = coalesce(new.approved_by, auth.uid());
    new.approved_at = coalesce(new.approved_at, now());
  end if;
  return new;
end;
$$;

create trigger trg_quotations_approval_role
  before update on quotations
  for each row execute function enforce_quotation_approval_role();
