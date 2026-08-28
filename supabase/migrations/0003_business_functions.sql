-- Khedma AI - Business functions
-- These run as SECURITY DEFINER so they can perform the few cross-table
-- operations that RLS otherwise blocks for regular authenticated users,
-- while still checking auth.uid() themselves so they cannot be abused.

-- ------------------------------------------------------------
-- Concurrency-safe sequential quotation numbering: DV-YYYY-000001
-- ------------------------------------------------------------
create or replace function next_quotation_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now())::int;
  v_next int;
begin
  if p_company_id <> app_current_company_id() and auth.role() <> 'service_role' then
    raise exception 'Not authorized for this company';
  end if;

  insert into company_quotation_counters (company_id, year, last_number)
  values (p_company_id, v_year, 1)
  on conflict (company_id, year)
  do update set last_number = company_quotation_counters.last_number + 1
  returning last_number into v_next;

  return 'DV-' || v_year::text || '-' || lpad(v_next::text, 6, '0');
end;
$$;

-- ------------------------------------------------------------
-- Company + first admin registration (used right after Supabase Auth signup)
-- ------------------------------------------------------------
create or replace function register_company_and_admin(
  p_company_name text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'This user already belongs to a company';
  end if;

  insert into companies (name) values (p_company_name)
  returning id into v_company_id;

  insert into profiles (id, company_id, full_name, role)
  values (auth.uid(), v_company_id, p_full_name, 'admin');

  return v_company_id;
end;
$$;

-- ------------------------------------------------------------
-- Admin-only teammate invite (creates a profile row for an already
-- Supabase-Auth-created user, e.g. via the admin API on the server side)
-- ------------------------------------------------------------
create or replace function add_team_member(
  p_user_id uuid,
  p_full_name text,
  p_role user_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if app_current_role() <> 'admin' then
    raise exception 'Only an admin may add team members';
  end if;

  v_company_id := app_current_company_id();

  if exists (select 1 from profiles where id = p_user_id) then
    raise exception 'User already has a profile';
  end if;

  insert into profiles (id, company_id, full_name, role)
  values (p_user_id, v_company_id, p_full_name, p_role);
end;
$$;
