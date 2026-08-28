-- Manual RLS verification script.
-- Run against a Supabase/Postgres instance that already has the migrations
-- applied and at least two companies with distinct auth.users/profiles.
--
-- How to use:
--   1. psql "$DATABASE_URL" -f supabase/tests/tenant_isolation.sql
--   2. Each `select` under a `set local role authenticated;` block simulates
--      what a signed-in user of that tenant can see. Expected row counts are
--      documented in the comments; a mismatch means an RLS policy regressed.
--
-- This script is illustrative rather than a CI-runnable pgTAP suite (no
-- pgTAP extension assumed available). It sets request.jwt.claims.sub to a
-- known auth.users.id for each tenant so app_current_company_id() resolves
-- correctly the same way it would for a real logged-in request.

begin;

-- Replace these with real ids seeded by scripts/seed.ts, or create throwaway
-- fixtures inline for a scratch database:
--   tenant A admin  : profiles.id = '11111111-1111-1111-1111-111111111111'
--   tenant B admin  : profiles.id = '22222222-2222-2222-2222-222222222222'

-- --- Tenant A view ---
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

-- Expect: only tenant A's own customers/products/quotations, never tenant B's.
select count(*) as tenant_a_visible_customers from customers;
select count(*) as tenant_a_visible_products from products;
select count(*) as tenant_a_visible_quotations from quotations;

-- Expect: 0 rows — a cross-tenant row fetched by id must not be returned.
select * from customers where company_id <> app_current_company_id();

reset role;

-- --- Tenant B view ---
set local role authenticated;
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select count(*) as tenant_b_visible_customers from customers;
select count(*) as tenant_b_visible_products from products;

-- Expect: an UPDATE targeting a row that belongs to tenant A affects 0 rows
-- even if the id is guessed correctly (IDOR check).
update customers set notes = 'hacked' where company_id <> app_current_company_id();
select count(*) as should_be_zero from customers where notes = 'hacked';

reset role;

-- --- Privilege escalation check ---
set local role authenticated;
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

-- Expect: raises "Changing company_id or role is not allowed from client requests"
do $$
begin
  update profiles set company_id = '11111111-1111-1111-1111-111111111111' where id = auth.uid();
  raise exception 'SECURITY REGRESSION: company_id was changed by a client request';
exception
  when others then
    if sqlerrm like '%not allowed%' then
      raise notice 'OK: privilege escalation correctly blocked';
    else
      raise;
    end if;
end $$;

reset role;

rollback;
