import { requireSession } from "@/lib/auth/session";
import ProductForm from "../product-form";
import { createProductAction } from "../actions";

export default async function NewProductPage() {
  await requireSession();

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gray-900">Nouveau produit</h1>
      <div className="card mt-4 p-6">
        <ProductForm action={createProductAction} submitLabel="Créer le produit" />
      </div>
    </div>
  );
}
