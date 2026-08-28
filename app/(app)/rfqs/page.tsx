import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import type { Rfq, RfqStatus } from "@/types/database";

const FILTERS: { label: string; value: RfqStatus | "all" }[] = [
  { label: "Toutes", value: "all" },
  { label: "Nouvelles", value: "new" },
  { label: "À vérifier", value: "needs_review" },
  { label: "Traitées", value: "processed" },
  { label: "Converties", value: "converted" },
];

const STATUS_LABELS: Record<RfqStatus, string> = {
  new: "Nouvelle",
  processing: "En traitement",
  needs_review: "À vérifier",
  processed: "Traitée",
  converted: "Convertie",
  rejected: "Rejetée",
};

export default async function RfqsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireSession();
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("rfqs")
    .select("*, customers(name)")
    .eq("company_id", session.company.id)
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data } = await query;
  const rfqs = (data ?? []) as (Rfq & { customers: { name: string } | null })[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Demandes de prix</h1>
        <Link href="/rfqs/new" className="btn-primary">
          + Nouvelle demande
        </Link>
      </div>

      <div className="mt-4 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/rfqs" : `/rfqs?status=${f.value}`}
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
              <Th>Date</Th>
              <Th>Client</Th>
              <Th>Extrait</Th>
              <Th>Langue</Th>
              <Th>Statut</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {rfqs.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600">{new Date(r.created_at).toLocaleDateString("fr-FR")}</td>
                <td className="px-4 py-3">
                  <Link href={`/rfqs/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.customers?.name ?? "Client non identifié"}
                  </Link>
                </td>
                <td className="max-w-md truncate px-4 py-3 text-gray-600">{r.raw_text}</td>
                <td className="px-4 py-3 text-gray-600">{r.language ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
            {rfqs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Aucune demande de prix.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RfqStatus }) {
  const cls =
    status === "processed" || status === "converted"
      ? "badge-green"
      : status === "needs_review"
        ? "badge-orange"
        : status === "rejected"
          ? "badge-red"
          : "badge-orange";
  return <span className={cls}>{STATUS_LABELS[status]}</span>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</th>;
}
