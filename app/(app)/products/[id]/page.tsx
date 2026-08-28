import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import type { Product } from "@/types/database";
import ProductForm from "../product-form";
import { updateProductAction } from "../actions";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("company_id", session.company.id)
    .maybeSingle();

  const product = data as Product | null;
  if (!product) {
    notFound();
  }

  const boundAction = updateProductAction.bind(null, product.id);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gray-900">{product.name}</h1>
      <div className="card mt-4 p-6">
        <ProductForm action={boundAction} defaultValues={product} submitLabel="Enregistrer" />
      </div>
    </div>
  );
}
