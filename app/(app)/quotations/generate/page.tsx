import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { assertAllItemsMatched } from "@/lib/quotation/guards";
import type { Customer, CustomerProductPrice, Product, RfqItem } from "@/types/database";
import GenerateQuotationForm from "./generate-form";

export default async function GenerateQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ rfq_id?: string; customer_id?: string }>;
}) {
  const session = await requireSession();
  const { rfq_id: rfqId, customer_id: customerIdParam } = await searchParams;

  if (!rfqId) {
    notFound();
  }

  const supabase = await createClient();
  const { data: rfqData } = await supabase
    .from("rfqs")
    .select("*, customers(id, name, default_discount_percent)")
    .eq("id", rfqId)
    .eq("company_id", session.company.id)
    .maybeSingle();

  if (!rfqData) {
    notFound();
  }
  const rfq = rfqData as { id: string; customer_id: string | null; customers: Customer | null };

  const { data: itemsData } = await supabase
    .from("rfq_items")
    .select("*, products(*)")
    .eq("rfq_id", rfq.id)
    .order("created_at");
  const items = (itemsData ?? []) as (RfqItem & { products: Product | null })[];

  // "Ambiguous" (70-89% confidence) items are allowed through deliberately —
  // only "unmatched" blocks generation (see lib/quotation/guards.ts). An
  // orphaned reference (product deleted after matching) is caught
  // separately since the guard only knows about status/matched_product_id.
  const guard = assertAllItemsMatched(items);
  const orphaned = items.filter((i) => i.matched_product_id && !i.products);
  if (items.length === 0 || !guard.ok || orphaned.length > 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold text-gray-900">Génération du devis impossible</h1>
        <p className="mt-2 text-sm text-red-600">
          Certains articles de cette demande ne sont pas encore associés à un produit du catalogue. Retournez à la
          demande de prix pour corriger les correspondances avant de générer le devis.
        </p>
        <Link href={`/rfqs/${rfq.id}`} className="btn-secondary mt-4 inline-flex">
          Retour à la demande de prix
        </Link>
      </div>
    );
  }

  const customerId = rfq.customer_id ?? customerIdParam ?? null;

  if (!customerId) {
    const { data: customersData } = await supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", session.company.id)
      .eq("is_active", true)
      .order("name");

    return (
      <div className="max-w-md">
        <h1 className="text-xl font-semibold text-gray-900">Sélectionner un client</h1>
        <p className="mt-2 text-sm text-gray-500">
          Cette demande de prix n&apos;a pas de client associé. Choisissez le client pour lequel générer le devis.
        </p>
        <form method="get" className="card mt-4 space-y-4 p-6">
          <input type="hidden" name="rfq_id" value={rfq.id} />
          <select name="customer_id" required className="input">
            <option value="">-- Choisir un client --</option>
            {(customersData ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary">
            Continuer
          </button>
        </form>
      </div>
    );
  }

  const { data: customerData } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("company_id", session.company.id)
    .maybeSingle();
  const customer = customerData as Customer | null;
  if (!customer) {
    notFound();
  }

  const productIds = items.map((i) => i.matched_product_id!) as string[];
  const { data: cppData } = await supabase
    .from("customer_product_prices")
    .select("*")
    .eq("customer_id", customerId)
    .in("product_id", productIds);
  const cppByProduct = new Map(((cppData ?? []) as CustomerProductPrice[]).map((c) => [c.product_id, c]));

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900">Aperçu du devis — {customer.name}</h1>
      <p className="mt-1 text-sm text-gray-500">
        Vérifiez les quantités (issues de la demande client) avant de générer le devis. Les prix et remises sont
        calculés automatiquement à partir de votre catalogue et des conditions client.
      </p>

      <GenerateQuotationForm
        rfqId={rfq.id}
        customerId={customer.id}
        customerDefaultDiscountPercent={customer.default_discount_percent}
        vatRatePercent={session.company.vat_rate}
        minimumMarginPercent={session.company.minimum_margin_percent}
        lines={items.map((item) => ({
          rfqItemId: item.id,
          description: item.raw_description,
          requestedQuantity: item.requested_quantity,
          matchConfidence: item.match_confidence,
          product: {
            id: item.products!.id,
            unit: item.products!.unit,
            base_sale_price: item.products!.base_sale_price,
            purchase_price: item.products!.purchase_price,
          },
          customerProductPrice: cppByProduct.get(item.matched_product_id!) ?? null,
        }))}
      />
    </div>
  );
}
