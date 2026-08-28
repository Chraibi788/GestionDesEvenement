import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import type { Customer, Quotation, QuotationStatus } from "@/types/database";

const FILTERS: { label: string; value: QuotationStatus | "all" }[] = [
  { label: "Tous", value: "all" },
  { label: "En attente d'approbation", value: "pending_approval" },
  { label: "Approuvés", value: "approved" },
  { label: "Envoyés", value: "sent" },
  { label: "Acceptés", value: "accepted" },
  { label: "Rejetés", value: "rejected" },
];

const STATUS_LABELS: Record<QuotationStatus, string> = {
  draft: "Brouillon",
  pending_approval: "En attente d'approbation",
  approved: "Approuvé",
  sent: "Envoyé",
  accepted: "Accepté",
  rejected: "Rejeté",
  expired: "Expiré",
};

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireSession();
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("quotations")
    .select("*, customers(name)")
    .eq("company_id", session.company.id)
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data } = await query;
  const quotations = (data ?? []) as (Quotation & { customers: Pick<Customer, "name"> | null })[];

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Devis</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/quotations" : `/quotations?status=${f.value}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              (status ?? "all") === f.value ? "bg-brand-600 text-white" : "bg-white text-gray-600 border border-gray-300"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>N° devis</Th>
              <Th>Client</Th>
              <Th>Date</Th>
              <Th>Total TTC</Th>
              <Th>Marge</Th>
              <Th>Statut</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {quotations.map((q) => (
              <tr key={q.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/quotations/${q.id}`} className="font-medium text-brand-700 hover:underline">
                    {q.quotation_number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600">{q.customers?.name ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600">{new Date(q.created_at).toLocaleDateString("fr-FR")}</td>
                <td className="px-4 py-3 font-medium text-gray-800">
                  {q.total.toFixed(2)} {q.currency}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {q.estimated_margin_percent != null ? `${q.estimated_margin_percent.toFixed(1)}%` : "Inconnue"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={q.status} />
                </td>
              </tr>
            ))}
            {quotations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Aucun devis.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: QuotationStatus }) {
  const cls =
    status === "approved" || status === "accepted"
      ? "badge-green"
      : status === "rejected" || status === "expired"
        ? "badge-red"
        : "badge-orange";
  return <span className={cls}>{STATUS_LABELS[status]}</span>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</th>;
}
