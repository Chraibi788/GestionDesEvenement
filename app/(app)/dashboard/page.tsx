import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { AuditLog } from "@/types/database";

const ACTION_LABELS: Record<string, string> = {
  RFQ_CREATED: "Demande de prix créée",
  RFQ_AI_EXTRACTED: "Analyse IA de la demande",
  PRODUCT_MATCHED: "Produit associé automatiquement",
  PRODUCT_MATCH_OVERRIDDEN: "Correspondance produit corrigée",
  QUOTATION_CREATED: "Devis créé",
  QUOTATION_EDITED: "Devis modifié",
  QUOTATION_APPROVED: "Devis approuvé",
  QUOTATION_REJECTED: "Devis rejeté",
  PDF_GENERATED: "PDF généré",
  CUSTOMER_CREATED: "Client créé",
  CUSTOMER_UPDATED: "Client modifié",
  PRODUCT_CREATED: "Produit créé",
  PRODUCT_UPDATED: "Produit modifié",
  PRODUCTS_IMPORTED: "Import de produits",
};

export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [rfqsThisMonth, quotationsThisMonth, pendingApprovals, needsReview, recentActivity] = await Promise.all([
    supabase
      .from("rfqs")
      .select("id", { count: "exact", head: true })
      .eq("company_id", session.company.id)
      .gte("created_at", startOfMonth),
    supabase
      .from("quotations")
      .select("id, total", { count: "exact" })
      .eq("company_id", session.company.id)
      .gte("created_at", startOfMonth),
    supabase
      .from("quotations")
      .select("id", { count: "exact", head: true })
      .eq("company_id", session.company.id)
      .eq("status", "pending_approval"),
    supabase
      .from("rfqs")
      .select("id", { count: "exact", head: true })
      .eq("company_id", session.company.id)
      .eq("status", "needs_review"),
    supabase
      .from("audit_logs")
      .select("*, profiles(full_name)")
      .eq("company_id", session.company.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const totalQuotationValue = ((quotationsThisMonth.data ?? []) as { total: number }[]).reduce((sum, q) => sum + q.total, 0);
  const activity = (recentActivity.data ?? []) as (AuditLog & { profiles: { full_name: string } | null })[];

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Tableau de bord</h1>
      <p className="mt-1 text-sm text-gray-500">Bienvenue, {session.profile.full_name} — {session.company.name}.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Demandes de prix ce mois-ci" value={String(rfqsThisMonth.count ?? 0)} href="/rfqs" />
        <StatCard label="Devis ce mois-ci" value={String(quotationsThisMonth.count ?? 0)} href="/quotations" />
        <StatCard label="Valeur des devis ce mois-ci" value={`${totalQuotationValue.toFixed(2)} ${session.company.currency}`} href="/quotations" />
        <StatCard
          label="Approbations en attente"
          value={String(pendingApprovals.count ?? 0)}
          href="/quotations?status=pending_approval"
          highlight={(pendingApprovals.count ?? 0) > 0}
        />
        <StatCard
          label="Demandes à vérifier"
          value={String(needsReview.count ?? 0)}
          href="/rfqs?status=needs_review"
          highlight={(needsReview.count ?? 0) > 0}
        />
      </div>

      <div className="card mt-6 p-4">
        <h2 className="text-sm font-semibold text-gray-700">Activité récente</h2>
        <ul className="mt-3 space-y-2 text-sm text-gray-600">
          {activity.map((log) => (
            <li key={log.id} className="flex justify-between border-b border-gray-100 pb-2 last:border-0">
              <span>
                {ACTION_LABELS[log.action] ?? log.action}
                {log.profiles?.full_name ? ` — ${log.profiles.full_name}` : log.actor_type === "ai" ? " — IA" : ""}
              </span>
              <span className="text-gray-400">{new Date(log.created_at).toLocaleString("fr-FR")}</span>
            </li>
          ))}
          {activity.length === 0 && <li className="text-gray-400">Aucune activité pour le moment.</li>}
        </ul>
      </div>
    </div>
  );
}

function StatCard({ label, value, href, highlight }: { label: string; value: string; href: string; highlight?: boolean }) {
  return (
    <Link href={href} className={`card block p-4 hover:border-brand-400 ${highlight ? "border-amber-300 bg-amber-50" : ""}`}>
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${highlight ? "text-amber-700" : "text-gray-900"}`}>{value}</p>
    </Link>
  );
}
