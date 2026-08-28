import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import type { AuditLog, Customer, Product, Quotation, QuotationItem } from "@/types/database";
import QuotationActionsPanel from "./quotation-actions-panel";
import EditQuotationForm from "./edit-quotation-form";

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  pending_approval: "En attente d'approbation",
  approved: "Approuvé",
  sent: "Envoyé",
  accepted: "Accepté",
  rejected: "Rejeté",
  expired: "Expiré",
};

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const supabase = await createClient();

  const { data: quotationData } = await supabase
    .from("quotations")
    .select("*, customers(*)")
    .eq("id", id)
    .eq("company_id", session.company.id)
    .maybeSingle();

  const quotation = quotationData as (Quotation & { customers: Customer | null }) | null;
  if (!quotation) {
    notFound();
  }

  const { data: itemsData } = await supabase
    .from("quotation_items")
    .select("*, products(sku, name)")
    .eq("quotation_id", quotation.id)
    .order("created_at");
  const items = (itemsData ?? []) as (QuotationItem & { products: Pick<Product, "sku" | "name"> | null })[];

  let rfqRawText: string | null = null;
  if (quotation.rfq_id) {
    const { data: rfqData } = await supabase.from("rfqs").select("raw_text").eq("id", quotation.rfq_id).maybeSingle();
    rfqRawText = (rfqData as { raw_text: string } | null)?.raw_text ?? null;
  }

  const { data: auditData } = await supabase
    .from("audit_logs")
    .select("*, profiles(full_name)")
    .eq("entity_type", "quotation")
    .eq("entity_id", quotation.id)
    .order("created_at", { ascending: false });
  const auditLogs = (auditData ?? []) as (AuditLog & { profiles: { full_name: string } | null })[];

  const lowMarginLines = items.filter(
    (i) => i.line_margin_percent != null && i.line_margin_percent < session.company.minimum_margin_percent
  );
  const unknownMarginLines = items.filter((i) => i.line_margin_percent == null);

  const canApprove = ["admin", "manager"].includes(session.profile.role) && quotation.status === "pending_approval";

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Devis {quotation.quotation_number}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {session.company.name} · Client: {quotation.customers?.name ?? "—"} · Créé le{" "}
            {new Date(quotation.created_at).toLocaleDateString("fr-FR")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={quotation.status} />
          <a href={`/api/quotations/${quotation.id}/pdf`} className="btn-secondary">
            Télécharger le PDF
          </a>
        </div>
      </div>

      {rfqRawText && (
        <div className="card mt-4 p-4">
          <h2 className="text-sm font-semibold text-gray-700">Message client d&apos;origine</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{rfqRawText}</p>
        </div>
      )}

      <div className="card mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>Produit</Th>
              <Th>Qté</Th>
              <Th>Prix unitaire</Th>
              <Th>Remise</Th>
              <Th>Prix net</Th>
              <Th>Sous-total</Th>
              <Th>Marge</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-gray-700">
                  {item.description}
                  {item.products && <span className="ml-1 text-xs text-gray-400">({item.products.sku})</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {item.quantity} {item.unit}
                </td>
                <td className="px-4 py-3 text-gray-600">{item.unit_price.toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-600">{item.discount_percent.toFixed(2)}%</td>
                <td className="px-4 py-3 text-gray-600">{item.net_unit_price.toFixed(2)}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{item.line_subtotal.toFixed(2)}</td>
                <td className="px-4 py-3">
                  {item.line_margin_percent != null ? (
                    <span className={item.line_margin_percent < session.company.minimum_margin_percent ? "text-red-600" : "text-gray-600"}>
                      {item.line_margin_percent.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-amber-600">Inconnue</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mt-4 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <Stat label="Sous-total HT" value={`${quotation.subtotal.toFixed(2)} ${quotation.currency}`} />
        <Stat label="Remise totale" value={`${quotation.discount_total.toFixed(2)} ${quotation.currency}`} />
        <Stat label={`TVA (${quotation.vat_rate}%)`} value={`${quotation.vat_amount.toFixed(2)} ${quotation.currency}`} />
        <Stat label="Total TTC" value={`${quotation.total.toFixed(2)} ${quotation.currency}`} emphasize />
      </div>

      {(lowMarginLines.length > 0 || unknownMarginLines.length > 0 || quotation.approval_required) && (
        <div className="card mt-4 border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">Avertissements</p>
          <ul className="mt-1 list-inside list-disc text-sm text-amber-700">
            {lowMarginLines.length > 0 && <li>Marge inférieure au seuil autorisé ({session.company.minimum_margin_percent}%) sur au moins un article.</li>}
            {unknownMarginLines.length > 0 && <li>Prix d&apos;achat absent pour au moins un article — marge inconnue.</li>}
            {quotation.approval_required && quotation.status === "pending_approval" && <li>Ce devis nécessite une approbation avant envoi.</li>}
          </ul>
        </div>
      )}

      <QuotationActionsPanel quotationId={quotation.id} canApprove={canApprove} status={quotation.status} />

      <EditQuotationForm quotation={quotation} />

      <div className="card mt-4 p-4">
        <h2 className="text-sm font-semibold text-gray-700">Historique</h2>
        <ul className="mt-2 space-y-2 text-sm text-gray-600">
          {auditLogs.map((log) => (
            <li key={log.id} className="flex justify-between border-b border-gray-100 pb-2 last:border-0">
              <span>
                {formatAction(log.action)} {log.profiles?.full_name ? `— ${log.profiles.full_name}` : log.actor_type === "ai" ? "— IA" : ""}
              </span>
              <span className="text-gray-400">{new Date(log.created_at).toLocaleString("fr-FR")}</span>
            </li>
          ))}
          {auditLogs.length === 0 && <li className="text-gray-400">Aucun historique.</li>}
        </ul>
      </div>
    </div>
  );
}

function formatAction(action: string) {
  const map: Record<string, string> = {
    QUOTATION_CREATED: "Devis créé",
    QUOTATION_EDITED: "Devis modifié",
    QUOTATION_APPROVED: "Devis approuvé",
    QUOTATION_REJECTED: "Devis rejeté",
    PDF_GENERATED: "PDF généré",
  };
  return map[action] ?? action;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "approved" || status === "accepted"
      ? "badge-green"
      : status === "rejected" || status === "expired"
        ? "badge-red"
        : "badge-orange";
  return <span className={cls}>{STATUS_LABELS[status] ?? status}</span>;
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className={emphasize ? "text-lg font-bold text-brand-700" : "text-base font-medium text-gray-800"}>{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</th>;
}
