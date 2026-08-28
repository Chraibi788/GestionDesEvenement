import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import type { Customer } from "@/types/database";
import RfqForm from "./rfq-form";

export default async function NewRfqPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("customers")
    .select("id, name")
    .eq("company_id", session.company.id)
    .eq("is_active", true)
    .order("name");
  const customers = (data ?? []) as Pick<Customer, "id" | "name">[];

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gray-900">Nouvelle demande de prix</h1>
      <p className="mt-1 text-sm text-gray-500">
        Collez le message du client (français, darija ou anglais). L&apos;IA identifie les produits demandés — les prix et
        le devis restent calculés par le système, jamais par l&apos;IA.
      </p>
      <div className="card mt-4 p-6">
        <RfqForm customers={customers} />
      </div>
    </div>
  );
}
