import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import type { Customer, Rfq, RfqItem } from "@/types/database";
import RfqItemsPanel from "./rfq-items-panel";

const LANGUAGE_LABELS: Record<string, string> = {
  fr: "Français",
  en: "Anglais",
  ar: "Arabe standard",
  darija: "Darija",
  unknown: "Inconnue",
};

export default async function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const supabase = await createClient();

  const { data: rfqData } = await supabase
    .from("rfqs")
    .select("*, customers(id, name)")
    .eq("id", id)
    .eq("company_id", session.company.id)
    .maybeSingle();

  const rfq = rfqData as (Rfq & { customers: Pick<Customer, "id" | "name"> | null }) | null;
  if (!rfq) {
    notFound();
  }

  const { data: itemsData } = await supabase
    .from("rfq_items")
    .select("*, products(id, sku, name, base_sale_price)")
    .eq("rfq_id", rfq.id)
    .order("created_at");

  const items = (itemsData ?? []) as (RfqItem & {
    products: { id: string; sku: string; name: string; base_sale_price: number } | null;
  })[];

  const extractedData = rfq.extracted_data as { error?: string } | null;
  const extractionError = extractedData && typeof extractedData === "object" ? (extractedData.error ?? null) : null;

  const { data: productsData } = await supabase
    .from("products")
    .select("id, sku, name, brand, base_sale_price")
    .eq("company_id", session.company.id)
    .eq("is_active", true)
    .order("name");

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Demande de prix — {rfq.customers?.name ?? "Client non identifié"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {new Date(rfq.created_at).toLocaleString("fr-FR")} · Langue détectée:{" "}
            {rfq.language ? (LANGUAGE_LABELS[rfq.language] ?? rfq.language) : "—"}
          </p>
        </div>
      </div>

      <div className="card mt-4 p-4">
        <h2 className="text-sm font-semibold text-gray-700">Message original du client</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{rfq.raw_text}</p>
      </div>

      <RfqItemsPanel
        rfqId={rfq.id}
        rfqStatus={rfq.status}
        customerId={rfq.customers?.id ?? null}
        items={items}
        products={(productsData ?? []) as { id: string; sku: string; name: string; brand: string | null; base_sale_price: number }[]}
        extractionError={extractionError}
      />
    </div>
  );
}
