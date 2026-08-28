import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import type { Product } from "@/types/database";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; brand?: string; category?: string }>;
}) {
  await requireSession();
  const { q, brand, category } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("products").select("*").order("name", { ascending: true });
  if (q) {
    query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%`);
  }
  if (brand) query = query.eq("brand", brand);
  if (category) query = query.eq("category", category);

  const { data } = await query;
  const products = (data ?? []) as Product[];

  const { data: filterData } = await supabase.from("products").select("brand, category");
  const brands = Array.from(new Set((filterData ?? []).map((p) => p.brand).filter(Boolean))) as string[];
  const categories = Array.from(new Set((filterData ?? []).map((p) => p.category).filter(Boolean))) as string[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Produits</h1>
        <div className="flex gap-3">
          <Link href="/products/import" className="btn-secondary">
            Importer CSV/Excel
          </Link>
          <Link href="/products/new" className="btn-primary">
            + Nouveau produit
          </Link>
        </div>
      </div>

      <form className="mt-4 flex flex-wrap gap-3" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Rechercher par SKU, nom, marque..."
          className="input max-w-sm"
        />
        <select name="brand" defaultValue={brand ?? ""} className="input max-w-xs">
          <option value="">Toutes les marques</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={category ?? ""} className="input max-w-xs">
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-secondary">
          Filtrer
        </button>
      </form>

      <div className="card mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>SKU</Th>
              <Th>Nom</Th>
              <Th>Marque</Th>
              <Th>Catégorie</Th>
              <Th>Prix de vente</Th>
              <Th>Prix d&apos;achat</Th>
              <Th>Stock</Th>
              <Th>Actif</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.sku}</td>
                <td className="px-4 py-3">
                  <Link href={`/products/${p.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600">{p.brand ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600">{p.category ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600">
                  {p.base_sale_price.toFixed(2)} {p.currency}
                </td>
                <td className="px-4 py-3 text-gray-600">{p.purchase_price ? p.purchase_price.toFixed(2) : "—"}</td>
                <td className="px-4 py-3 text-gray-600">{p.stock_quantity ?? "—"}</td>
                <td className="px-4 py-3">
                  {p.is_active ? <span className="badge-green">Actif</span> : <span className="badge-red">Inactif</span>}
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  Aucun produit trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</th>;
}
