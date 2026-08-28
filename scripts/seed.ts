/**
 * Demo data seed script for local development.
 *
 * Creates the exact demo company/products/customer described in the
 * project README (Atlas Industrial Supplies SARL), so the acceptance-
 * criteria RFQ ("Bonjour, merci de nous chiffrer 20 roulements 6205 et 4
 * fûts d'huile hydraulique ISO VG 68.") produces the expected quotation.
 *
 * Uses the Supabase service-role key (bypasses RLS by design — this is a
 * server-side admin script, never run this key in the browser) and is
 * idempotent: re-running it will not create duplicates.
 *
 * Usage: npm run seed
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in your environment (.env.local).");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_COMPANY_NAME = "Atlas Industrial Supplies SARL";
const DEMO_ADMIN_EMAIL = "admin@atlas-industrial.ma";
const DEMO_ADMIN_PASSWORD = "Demo1234!";

const DEMO_PRODUCTS = [
  {
    sku: "P001",
    name: "Roulement 6205",
    brand: "SKF",
    category: "Roulements",
    unit: "unit",
    base_sale_price: 95,
    purchase_price: 65,
    stock_quantity: 500,
    technical_keywords: ["roulement", "bearing", "6205"],
  },
  {
    sku: "P002",
    name: "Roulement 6206",
    brand: "SKF",
    category: "Roulements",
    unit: "unit",
    base_sale_price: 120,
    purchase_price: 80,
    stock_quantity: 350,
    technical_keywords: ["roulement", "bearing", "6206"],
  },
  {
    sku: "P003",
    name: "Huile hydraulique ISO VG 68",
    brand: "DemoLub",
    category: "Lubrifiants",
    unit: "fut",
    packaging: "208L",
    base_sale_price: 3250,
    purchase_price: 2500,
    stock_quantity: 40,
    technical_keywords: ["hydraulic oil", "huile hydraulique", "ISO VG 68", "HLP 68", "hyd 68"],
  },
  {
    sku: "P004",
    name: "Graisse EP2",
    brand: "DemoLub",
    category: "Lubrifiants",
    unit: "seau",
    packaging: "18kg",
    base_sale_price: 1750,
    purchase_price: 1280,
    stock_quantity: 60,
    technical_keywords: ["graisse", "grease", "EP2"],
  },
];

async function findUserByEmail(email: string) {
  // No direct getUserByEmail on this SDK version; paginate listUsers.
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function main() {
  console.log(`Seeding demo data for "${DEMO_COMPANY_NAME}"...`);

  let { data: company } = await admin.from("companies").select("*").eq("name", DEMO_COMPANY_NAME).maybeSingle();

  if (!company) {
    const { data: created, error } = await admin
      .from("companies")
      .insert({
        name: DEMO_COMPANY_NAME,
        legal_name: DEMO_COMPANY_NAME,
        ice: "001234567000089",
        address: "Zone Industrielle, Lot 42",
        city: "Casablanca",
        country: "Morocco",
        phone: "+212 522 000 000",
        email: "contact@atlas-industrial.ma",
        currency: "MAD",
        vat_rate: 20,
        minimum_margin_percent: 15,
      })
      .select("*")
      .single();
    if (error) throw error;
    company = created;
    console.log(`Created company ${company.id}`);
  } else {
    console.log(`Company already exists (${company.id}), skipping creation.`);
  }

  let adminUser = await findUserByEmail(DEMO_ADMIN_EMAIL);
  if (!adminUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email: DEMO_ADMIN_EMAIL,
      password: DEMO_ADMIN_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    adminUser = data.user;
    console.log(`Created demo admin user ${DEMO_ADMIN_EMAIL}`);
  } else {
    console.log(`Demo admin user already exists (${adminUser.id}), skipping creation.`);
  }

  const { data: existingProfile } = await admin.from("profiles").select("id").eq("id", adminUser.id).maybeSingle();
  if (!existingProfile) {
    const { error } = await admin.from("profiles").insert({
      id: adminUser.id,
      company_id: company.id,
      full_name: "Admin Démo",
      role: "admin",
    });
    if (error) throw error;
    console.log("Linked demo admin user to the demo company as admin.");
  }

  for (const product of DEMO_PRODUCTS) {
    const { error } = await admin
      .from("products")
      .upsert({ ...product, company_id: company.id, currency: "MAD", is_active: true }, { onConflict: "company_id,sku" });
    if (error) throw error;
  }
  console.log(`Upserted ${DEMO_PRODUCTS.length} demo products.`);

  const { data: existingCustomer } = await admin
    .from("customers")
    .select("id")
    .eq("company_id", company.id)
    .eq("name", "ABC Industrie")
    .maybeSingle();

  if (!existingCustomer) {
    const { error } = await admin.from("customers").insert({
      company_id: company.id,
      name: "ABC Industrie",
      city: "Casablanca",
      default_discount_percent: 7,
      payment_terms_days: 60,
      is_active: true,
    });
    if (error) throw error;
    console.log("Created demo customer ABC Industrie (7% discount, 60 days payment terms).");
  } else {
    console.log("Demo customer ABC Industrie already exists, skipping creation.");
  }

  console.log("\nSeed complete. Demo login:");
  console.log(`  Email:    ${DEMO_ADMIN_EMAIL}`);
  console.log(`  Password: ${DEMO_ADMIN_PASSWORD}`);
  console.log("\nTry pasting this into /rfqs/new:");
  console.log('  "Bonjour, merci de nous chiffrer 20 roulements 6205 et 4 fûts d\'huile hydraulique ISO VG 68."');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
