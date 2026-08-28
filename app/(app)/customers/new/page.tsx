import { requireSession } from "@/lib/auth/session";
import CustomerForm from "../customer-form";
import { createCustomerAction } from "../actions";

export default async function NewCustomerPage() {
  await requireSession();

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gray-900">Nouveau client</h1>
      <div className="card mt-4 p-6">
        <CustomerForm action={createCustomerAction} submitLabel="Créer le client" />
      </div>
    </div>
  );
}
