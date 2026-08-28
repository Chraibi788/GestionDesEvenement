import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import type { Customer } from "@/types/database";
import CustomerForm from "../customer-form";
import { updateCustomerAction } from "../actions";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("company_id", session.company.id)
    .maybeSingle();

  const customer = data as Customer | null;
  if (!customer) {
    notFound();
  }

  const boundAction = updateCustomerAction.bind(null, customer.id);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gray-900">{customer.name}</h1>
      <div className="card mt-4 p-6">
        <CustomerForm action={boundAction} defaultValues={customer} submitLabel="Enregistrer" />
      </div>
    </div>
  );
}
