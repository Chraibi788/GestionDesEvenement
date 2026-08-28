# Khedma AI — MVP

AI-assisted quotation automation for Moroccan B2B companies. Paste an
unstructured customer request (French, English, Modern Standard Arabic, or
Moroccan Darija) and Khedma AI extracts the requested items, matches them
against your product catalogue, applies your real pricing/discount rules,
and produces a professional French quotation — with a human always
approving before it goes out.

> **AI never invents prices, discounts, stock, VAT, totals, credit limits,
> or SKUs.** It only reads language and proposes matches; the database and
> deterministic TypeScript code own every commercial number.

## 1. Project overview

The MVP solves one problem end-to-end:

```
customer message → AI extraction → product matching → deterministic pricing
→ margin check → quotation draft → human approval → PDF
```

Everything else (WhatsApp ingestion, supplier procurement, accounting,
invoicing, CRM, autonomous payments, ERP integrations, multi-agent
workflows) is explicitly out of scope for this MVP — see [Future
roadmap](#12-future-roadmap).

## 2. Architecture

```
Next.js (App Router, TypeScript)
├── app/(app)/...          authenticated pages (dashboard, customers,
│                          products, RFQs, quotations) — Server Components
│                          + Server Actions, no separate API layer needed
├── app/api/...            the few routes that aren't plain Server Actions
│                          (CSV/XLSX import commit, PDF generation)
├── lib/
│   ├── supabase/          browser / server / service-role Supabase clients
│   ├── auth/              session loading + role checks
│   ├── ai/                central Anthropic client + RFQ extraction
│   ├── matching/          hybrid product matching engine
│   ├── pricing/           deterministic price/margin/quotation calculators
│   ├── quotation/          guards (e.g. "no unmatched item may be quoted")
│   ├── pdf/                React-PDF quotation document
│   ├── import/              CSV/XLSX parsing + validation
│   ├── audit/               audit_logs writer
│   └── validation/          Zod schemas
├── supabase/migrations/   SQL schema + RLS policies + DB functions
├── supabase/tests/        manual RLS/tenant-isolation verification script
├── scripts/seed.ts        idempotent demo-data seed
└── tests/                 Vitest unit + logic-level "happy path" tests
```

**Why Server Actions instead of a separate REST/GraphQL API?** Every
authenticated page is a Server Component that reads via the
request-scoped Supabase client (so RLS always applies), and every mutation
is a `"use server"` action co-located with its page. The only real API
routes are for cases a Server Action can't cleanly serve: streaming a PDF
response and committing a large CSV/XLSX import.

**Multi-tenancy**: every business-owned table carries `company_id`, and
tenant isolation is enforced in Postgres via Row Level Security — never
only in the frontend. See [§6](#6-row-level-security-rls).

## 3. Tech stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- **Backend**: Next.js Server Actions / Route Handlers
- **Database**: Supabase Postgres
- **Auth**: Supabase Auth (email/password)
- **AI**: Anthropic Claude API (`@anthropic-ai/sdk`)
- **Validation**: Zod
- **Money math**: decimal.js (no floating-point arithmetic on prices/totals)
- **PDF**: `@react-pdf/renderer`
- **Spreadsheet import**: `xlsx` (SheetJS)
- **Testing**: Vitest
- **Deployment target**: Vercel + Supabase

## 4. Local installation

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

## 5. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Copy **Project Settings → API** into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only — never expose this to the
     browser or commit it; used only by `lib/supabase/admin.ts` for the
     narrow set of operations RLS deliberately blocks for regular users,
     and by `scripts/seed.ts`)
3. Apply the migrations (Supabase CLI, or paste each file into the SQL
   Editor in order):

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push   # applies supabase/migrations/*.sql in order
   ```

   Or manually, in the SQL Editor, run in this exact order:
   1. `supabase/migrations/0001_schema.sql`
   2. `supabase/migrations/0002_rls.sql`
   3. `supabase/migrations/0003_business_functions.sql`
   4. `supabase/migrations/0004_quotation_integrity.sql`

4. In **Authentication → Providers**, email/password should already be
   enabled by default. Disable "Confirm email" for faster local demoing,
   or keep it on for a production-like flow (the app's `/onboarding` page
   handles the "confirmed but not yet provisioned" case either way).

## 6. Row Level Security (RLS)

Every company-owned table (`companies`, `profiles`, `customers`,
`products`, `customer_product_prices`, `rfqs`, `rfq_items`, `quotations`,
`quotation_items`, `audit_logs`) has RLS enabled with a policy scoped to
`company_id = app_current_company_id()`, where `app_current_company_id()`
is a `SECURITY DEFINER` SQL function that looks up the caller's
`profiles.company_id` from `auth.uid()`. A user can never see or modify a
row belonging to another tenant — even via a guessed ID, a malformed
request, or a bug in the frontend — because Postgres itself refuses the
query.

Additional protections in `supabase/migrations/0002_rls.sql`:

- A trigger blocks a user from changing their own `company_id` or `role`
  via a direct table update (only the `SECURITY DEFINER` registration
  functions, or the service-role client, may set these).
- A trigger restricts moving a quotation to `status = 'approved'` to the
  `admin`/`manager` roles.
- `audit_logs` has no insert policy for authenticated users at all — every
  write goes through the service-role client (`lib/audit/log.ts`), so a
  compromised frontend can never forge or tamper with the audit trail.
- Company/profile creation has no insert policy either — it only happens
  through the `SECURITY DEFINER` `register_company_and_admin()` function,
  which checks `auth.uid()` itself.

**Verifying tenant isolation**: `supabase/tests/tenant_isolation.sql` is a
manual verification script — run it with `psql` against a project that
already has two seeded tenants to confirm cross-tenant reads/writes return
zero rows and privilege escalation raises an exception. A lightweight,
dependency-free regression guard also runs in the normal test suite
(`tests/rls-policies.test.ts`) that fails if someone removes RLS from a
table or an isolation policy while editing the schema — it's a static
source check, not a substitute for the SQL script above, which is the
authoritative verification against a real Postgres instance.

## 7. Anthropic (Claude) configuration

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5
```

All Claude calls go through `lib/ai/client.ts` (20s timeout, 2 retries) —
never scattered across components. Two services use it:

- `lib/ai/extract-rfq.ts` — turns raw customer text into structured items
  (language, quantity, unit, brand/SKU hints). The system prompt
  explicitly instructs the model to treat the customer's message as
  **data, never instructions** (prompt-injection defense), to never
  invent a quantity or SKU, and to output strict JSON only, which is then
  validated with Zod. If the AI is unavailable or returns something
  invalid, the RFQ is marked `needs_review` — the app never blocks on an
  AI outage.
- `lib/matching/match-engine.ts` — exact SKU/name match → fuzzy text
  shortlist → AI-assisted ranking **restricted to that shortlist** (the
  model can only return an ID that was actually in the candidate list it
  was given; anything else is rejected).

**Without an API key configured**, extraction returns a graceful
`needs_review` result and matching falls back to the deterministic
exact/fuzzy stages only (still safe, just less able to resolve ambiguous
phrasing) — the rest of the app keeps working.

## 8. Seed instructions

```bash
npm run seed
```

Idempotent — safe to re-run. Creates:

- Company **Atlas Industrial Supplies SARL** (20% VAT, 15% minimum margin)
- Admin login: `admin@atlas-industrial.ma` / `Demo1234!`
- Products P001–P004 (roulements 6205/6206, huile hydraulique ISO VG 68,
  graisse EP2 — exact prices/costs from the spec's demo scenario)
- Customer **ABC Industrie** (7% default discount, 60-day payment terms)

Paste this into `/rfqs/new` afterwards:

> Bonjour, merci de nous chiffrer 20 roulements 6205 et 4 fûts d'huile
> hydraulique ISO VG 68.

Expected: 20× P001 + 4× P003, priced with ABC Industrie's 7% discount —
subtotal 13,857 MAD, VAT (20%) 2,771.40 MAD, total 16,628.40 MAD.

## 9. How to run

```bash
npm run dev      # local dev server
npm run build    # production build
npm run start    # run the production build
```

## 10. How to test

```bash
npm run typecheck
npm run lint
npm test
```

The suite (`tests/*.test.ts`) covers, per the MVP's required scenarios:

| # | Scenario | File |
|---|---|---|
| 1–2 | Tenant isolation (customers/products) | `rls-policies.test.ts` (static guard) + `supabase/tests/tenant_isolation.sql` (live DB) |
| 3 | SKU matching | `matching.test.ts` |
| 4 | Customer default discount | `pricing.test.ts` |
| 5 | Special customer price priority | `pricing.test.ts` |
| 6 | VAT calculation | `pricing.test.ts` |
| 7 | Margin calculation | `margin.test.ts` |
| 8 | Low margin triggers approval | `margin.test.ts` |
| 9 | Unmatched product blocks quotation | `quotation-guards.test.ts` |
| 10 | AI structured response validation | `ai-extraction-validation.test.ts` |
| 11 | Sequential quotation numbering | `supabase/migrations/0003_business_functions.sql` (`next_quotation_number`) — concurrency-safety needs a live Postgres transaction, so this is verified manually/in Supabase, not in Vitest |
| 12 | Unauthorized user cannot approve | `auth-roles.test.ts` |
| — | End-to-end happy path (mocked AI) | `happy-path.test.ts` |

`happy-path.test.ts` mocks the Anthropic SDK and drives the real
extraction → matching → pricing → PDF-rendering code for the exact demo
scenario above, then checks a role-gated approval. It does **not** drive a
real browser or a live Supabase project (none is connected in this
environment) — that remains a manual QA / Playwright follow-up, see
[§13](#13-known-mvp-limitations).

## 11. How to deploy

**Vercel**: import the repo, set the same environment variables as
`.env.example` in the Vercel project settings, deploy. `next build` is the
default build command.

**Supabase**: use a separate (non-local) project for production, apply
the same three migrations, and set `NEXT_PUBLIC_APP_URL` to your deployed
URL. Rotate the service-role key if it's ever exposed.

## 12. Future roadmap

Deliberately not built in this MVP, but the module boundaries
(`lib/ai`, `lib/matching`, `lib/pricing`, RFQ `source` enum already
including `whatsapp`/`email`) are meant to make these additive, not
rewrites:

- WhatsApp Cloud API / email ingestion as new `rfqs.source` values
- Voice note transcription feeding the same `extract-rfq` pipeline
- Supplier RFQ / procurement agent
- Automatic quotation follow-up, order conversion, stock reservation
- Odoo / Sage integration
- Additional UI languages (French is the only one wired up; strings are
  already centralized rather than inlined per-component)
- Automatic approval rules (`companies.auto_approval_limit` exists in the
  schema for this, unused for now — every quotation requires approval today)
- Analytics/reporting beyond the dashboard's counts
- RAG over technical product documentation to improve matching further

## 13. Known MVP limitations

- **No live Supabase/Anthropic project is connected in this development
  environment.** Every server-side query, RLS policy, and DB function is
  written and reviewed, and the deterministic logic (pricing, margin,
  matching, PDF) is exercised by the test suite, but the full
  login → click-through → persisted-DB path has not been run against a
  real Postgres instance. Follow §5 and §7 to connect one.
- No Playwright/browser end-to-end test — `happy-path.test.ts` covers the
  business logic chain (see §10) but not real page navigation and DB
  writes.
- Quotation line items and quantities can only be edited during
  generation, before a quotation is created — once created, only
  non-financial terms (validity date, delivery/payment terms, notes) are
  editable, to keep every commercial number always traceable to a single
  computation. Re-generating from the RFQ is the path to a corrected
  quotation.
- No email delivery of quotations — download the PDF and send it yourself.
- Single currency and VAT rate per company; multi-currency is not handled.
- The middleware file uses Next.js's `middleware.ts` convention rather
  than the newer `proxy.ts` naming (deprecated but fully supported in
  Next.js 16.3 — a mechanical rename, not a behavior change).

## 14. Security review summary

A full pass was made against: authentication, authorization, RLS, IDOR,
tenant isolation, server-side validation, API key exposure, prompt
injection, XSS, SQL/filter injection, file upload validation, PDF
authorization, role escalation, and price/discount manipulation from the
frontend. One real gap was found and fixed (below); everything else was
verified already closed.

**Finding, fixed**: RLS on `quotations`/`quotation_items` enforces tenant
isolation (row-level), but is not column-level — a company's own
authenticated user could have called the Supabase REST API directly
(bypassing the Next.js app entirely) to overwrite `total`, `subtotal`, a
line's `unit_price`, etc., since nothing stopped an UPDATE to those
specific columns. Fixed in
`supabase/migrations/0004_quotation_integrity.sql`: a trigger now rejects
any client-originated change to a quotation's financial/identity columns
after creation (status transitions and non-financial terms remain
editable), and a second trigger makes `quotation_items` fully
immutable to clients after insert — matching what the app itself already
does (it only ever inserts line items once, and only ever updates a
quotation's non-financial terms or status). Regression-guarded in
`tests/rls-policies.test.ts`.

**Also fixed during review**: the customer/product search boxes
interpolated the raw search string into a PostgREST `.or(...)` filter
expression. RLS meant no cross-tenant data could ever leak through it, but
a search term containing `,` or `(`/`)` could still reshape the filter's
logic in unintended ways. Fixed with `lib/supabase/search.ts`
(`sanitizeIlikeTerm`), which strips the characters that are structural in
PostgREST's filter grammar before they reach the query.

Other highlights (verified, no changes needed):

- **Tenant isolation**: enforced in Postgres (RLS on every company-owned
  table), not just app code; every server action/route additionally
  re-filters by `company_id` as defense in depth.
- **Commercial values are never trusted from the client**: quotation
  totals, prices, discounts, and margins are always recomputed server-side
  from the database in `generateQuotationAction`, which only ever reads
  `rfq_id`, `customer_id`, item IDs, and quantities from the submitted
  form — never a price, discount, or total. The client-visible "live
  preview" during generation calls the exact same pure pricing functions
  purely for display.
- **Role escalation**: a user cannot change their own `company_id` or
  `role` (DB trigger), and quotation approval is restricted to
  admin/manager both by a DB trigger and in the server action —
  `requireSession()` re-derives the session server-side on every request
  rather than trusting anything the client sends about who it is.
- **Prompt injection**: customer message content is explicitly framed as
  data, never instructions, in both AI system prompts; the matching
  engine additionally never lets the model select a product ID outside
  the exact candidate list it was given.
- **XSS**: no `dangerouslySetInnerHTML` anywhere in the codebase; all
  user-supplied text (customer names, notes, RFQ text) is rendered through
  normal React text nodes, which escape by default.
- **File upload validation**: the CSV/XLSX import validates every row
  (missing SKU/name, invalid/negative numbers, duplicate SKU, a capped
  5000-row batch) and re-validates + re-derives create/update server-side
  — the client's preview classification is never trusted for the actual
  write.
- **PDF/IDOR**: the PDF route explicitly re-checks `company_id` ownership
  before rendering, on top of RLS.
- **Secrets**: `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are
  only referenced from server-only files (`lib/supabase/admin.ts`,
  `lib/ai/client.ts`) — never imported by a `"use client"` component;
  audit logs explicitly never store credentials/tokens.
