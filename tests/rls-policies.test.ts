import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// True tenant-isolation verification requires a live Postgres instance with
// RLS enforced — see supabase/tests/tenant_isolation.sql, which is the
// authoritative check (run it against a real Supabase project). These
// tests are a fast, dependency-free regression guard that catches the most
// common accidental regression: someone removes `enable row level
// security` or a `company_id` policy while editing the schema file.
const rlsSql = readFileSync(new URL("../supabase/migrations/0002_rls.sql", import.meta.url), "utf8");
const integritySql = readFileSync(new URL("../supabase/migrations/0004_quotation_integrity.sql", import.meta.url), "utf8");

const TENANT_TABLES = [
  "companies",
  "profiles",
  "customers",
  "products",
  "customer_product_prices",
  "rfqs",
  "rfq_items",
  "quotations",
  "quotation_items",
  "audit_logs",
];

describe("RLS policy source (static regression guard)", () => {
  it.each(TENANT_TABLES)("enables row level security on %s", (table) => {
    expect(rlsSql).toMatch(new RegExp(`alter table ${table} enable row level security`));
  });

  it("scopes the customers table policy to app_current_company_id()", () => {
    const customersBlock = rlsSql.slice(rlsSql.indexOf("customers enable row level security"));
    expect(customersBlock.slice(0, 300)).toContain("company_id = app_current_company_id()");
  });

  it("scopes the products table policy to app_current_company_id()", () => {
    const productsBlock = rlsSql.slice(rlsSql.indexOf("products enable row level security"));
    expect(productsBlock.slice(0, 300)).toContain("company_id = app_current_company_id()");
  });

  it("blocks a user from changing their own company_id or role", () => {
    expect(rlsSql).toContain("prevent_profile_privilege_escalation");
    expect(rlsSql).toContain("Changing company_id or role is not allowed from client requests");
  });

  it("restricts quotation approval to admin/manager roles", () => {
    expect(rlsSql).toContain("enforce_quotation_approval_role");
    expect(rlsSql).toContain("app_is_admin_or_manager()");
  });

  it("does not grant authenticated users an insert policy on audit_logs", () => {
    // audit_logs writes must go through the service-role client only
    // (see lib/audit/log.ts) — there should be no `for insert` (or `for
    // all`) policy on this table for the authenticated role.
    const auditBlock = rlsSql.slice(rlsSql.indexOf("audit_logs enable row level security"));
    expect(auditBlock).not.toMatch(/audit_logs\s*\n\s*for (insert|all)/);
  });

  it("blocks a client request from rewriting a quotation's financial fields after creation", () => {
    // Security review finding: RLS alone is row-level, not column-level —
    // without this trigger, a company's own authenticated user could call
    // the Supabase REST API directly and overwrite `total`/`subtotal`/etc,
    // bypassing the pricing engine entirely.
    expect(integritySql).toContain("protect_quotation_financials");
    expect(integritySql).toContain("auth.role() = 'service_role'");
    expect(integritySql).toMatch(/new\.total is distinct from old\.total/);
  });

  it("blocks any client update to quotation_items after creation", () => {
    expect(integritySql).toContain("protect_quotation_items");
    expect(integritySql).toContain("Quotation line items cannot be modified after creation");
  });
});
