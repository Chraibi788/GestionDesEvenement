import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import ImportWizard from "./import-wizard";

export default async function ProductImportPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data } = await supabase.from("products").select("sku").eq("company_id", session.company.id);
  const existingSkus = ((data ?? []) as { sku: string }[]).map((p) => p.sku);

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Importer des produits</h1>
      <p className="mt-1 text-sm text-gray-500">Fichier CSV ou Excel (.xlsx). Un SKU déjà existant sera mis à jour.</p>
      <div className="card mt-4 p-6">
        <ImportWizard existingSkus={existingSkus} />
      </div>
    </div>
  );
}
