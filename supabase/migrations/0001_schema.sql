-- Khedma AI - Initial schema
-- Extensions
create extension if not exists pgcrypto;

-- Enums
create type user_role as enum ('admin', 'manager', 'salesperson');
create type rfq_source as enum ('manual', 'email', 'whatsapp', 'other');
create type rfq_status as enum ('new', 'processing', 'needs_review', 'processed', 'converted', 'rejected');
create type rfq_item_status as enum ('matched', 'ambiguous', 'unmatched');
create type quotation_status as enum ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'expired');
create type audit_actor_type as enum ('user', 'ai', 'system');

-- updated_at helper trigger
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- companies
-- ============================================================
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  logo_url text,
  ice text,
  if_number text,
  rc text,
  address text,
  city text,
  country text not null default 'Morocco',
  phone text,
  email text,
  currency text not null default 'MAD',
  vat_rate numeric(5,2) not null default 20,
  minimum_margin_percent numeric(5,2) not null default 15,
  auto_approval_limit numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_companies_updated_at
  before update on companies
  for each row execute function set_updated_at();

-- ============================================================
-- profiles (1-1 with auth.users)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete restrict,
  full_name text not null,
  role user_role not null default 'salesperson',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_company_id on profiles(company_id);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ============================================================
-- customers
-- ============================================================
create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_code text,
  name text not null,
  legal_name text,
  ice text,
  email text,
  phone text,
  address text,
  city text,
  default_discount_percent numeric(5,2) not null default 0,
  payment_terms_days integer not null default 0,
  credit_limit numeric(14,2),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customers_company_id on customers(company_id);
create index idx_customers_name on customers(company_id, name);
create index idx_customers_phone on customers(company_id, phone);
create index idx_customers_email on customers(company_id, email);
create unique index uq_customers_company_code on customers(company_id, customer_code) where customer_code is not null;

create trigger trg_customers_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- ============================================================
-- products
-- ============================================================
create table products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  brand text,
  category text,
  unit text not null default 'unit',
  packaging text,
  purchase_price numeric(14,2),
  base_sale_price numeric(14,2) not null,
  minimum_sale_price numeric(14,2),
  stock_quantity numeric(14,2),
  currency text not null default 'MAD',
  technical_keywords text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_products_company_sku on products(company_id, sku);
create index idx_products_company_id on products(company_id);
create index idx_products_name on products(company_id, name);
create index idx_products_brand on products(company_id, brand);
create index idx_products_category on products(company_id, category);
create index idx_products_keywords on products using gin(technical_keywords);

create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ============================================================
-- customer_product_prices
-- ============================================================
create table customer_product_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  special_price numeric(14,2),
  discount_percent numeric(5,2),
  valid_from date,
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_cpp_company_id on customer_product_prices(company_id);
create index idx_cpp_customer_product on customer_product_prices(customer_id, product_id);

create trigger trg_cpp_updated_at
  before update on customer_product_prices
  for each row execute function set_updated_at();

-- ============================================================
-- rfqs
-- ============================================================
create table rfqs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  source rfq_source not null default 'manual',
  raw_text text not null,
  language text,
  status rfq_status not null default 'new',
  ai_confidence numeric(5,2),
  extracted_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_rfqs_company_id on rfqs(company_id);
create index idx_rfqs_status on rfqs(company_id, status);
create index idx_rfqs_customer_id on rfqs(customer_id);

create trigger trg_rfqs_updated_at
  before update on rfqs
  for each row execute function set_updated_at();

-- ============================================================
-- rfq_items
-- ============================================================
create table rfq_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  rfq_id uuid not null references rfqs(id) on delete cascade,
  raw_description text not null,
  requested_quantity numeric(14,3) not null,
  requested_unit text,
  matched_product_id uuid references products(id) on delete set null,
  match_confidence numeric(5,2),
  match_reason text,
  status rfq_item_status not null default 'unmatched',
  created_at timestamptz not null default now()
);

create index idx_rfq_items_company_id on rfq_items(company_id);
create index idx_rfq_items_rfq_id on rfq_items(rfq_id);

-- ============================================================
-- quotations
-- ============================================================
create table quotations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  quotation_number text not null,
  rfq_id uuid references rfqs(id) on delete set null,
  customer_id uuid not null references customers(id) on delete restrict,
  created_by uuid references profiles(id) on delete set null,
  status quotation_status not null default 'draft',
  currency text not null default 'MAD',
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  vat_rate numeric(5,2) not null,
  vat_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  estimated_margin_percent numeric(5,2),
  valid_until date,
  delivery_terms text,
  payment_terms text,
  notes text,
  approval_required boolean not null default true,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_quotations_company_number on quotations(company_id, quotation_number);
create index idx_quotations_company_id on quotations(company_id);
create index idx_quotations_status on quotations(company_id, status);
create index idx_quotations_customer_id on quotations(customer_id);

create trigger trg_quotations_updated_at
  before update on quotations
  for each row execute function set_updated_at();

-- ============================================================
-- quotation_items
-- ============================================================
create table quotation_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  quotation_id uuid not null references quotations(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  description text not null,
  quantity numeric(14,3) not null,
  unit text not null,
  unit_price numeric(14,2) not null,
  discount_percent numeric(5,2) not null default 0,
  net_unit_price numeric(14,2) not null,
  line_subtotal numeric(14,2) not null,
  purchase_cost numeric(14,2),
  line_margin_percent numeric(5,2),
  created_at timestamptz not null default now()
);

create index idx_quotation_items_company_id on quotation_items(company_id);
create index idx_quotation_items_quotation_id on quotation_items(quotation_id);

-- ============================================================
-- company_quotation_counters (backs concurrency-safe numbering)
-- ============================================================
create table company_quotation_counters (
  company_id uuid not null references companies(id) on delete cascade,
  year int not null,
  last_number int not null default 0,
  primary key (company_id, year)
);

-- ============================================================
-- audit_logs
-- ============================================================
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  actor_type audit_actor_type not null default 'user',
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_company_id on audit_logs(company_id);
create index idx_audit_logs_entity on audit_logs(company_id, entity_type, entity_id);
create index idx_audit_logs_created_at on audit_logs(company_id, created_at desc);
