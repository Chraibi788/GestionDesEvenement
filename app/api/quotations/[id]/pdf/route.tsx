import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getApiSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import { QuotationPdfDocument } from "@/lib/pdf/quotation-pdf";
import type { Customer, Product, Quotation, QuotationItem } from "@/types/database";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createClient();

  // Tenant check is enforced twice on purpose: RLS on the query itself, and
  // this explicit company_id filter, so a guessed quotation id from another
  // tenant can never produce a PDF (IDOR protection).
  const { data: quotationData } = await supabase
    .from("quotations")
    .select("*")
    .eq("id", id)
    .eq("company_id", session.company.id)
    .maybeSingle();
  const quotation = quotationData as Quotation | null;
  if (!quotation) {
    return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });
  }

  const { data: customerData } = await supabase
    .from("customers")
    .select("*")
    .eq("id", quotation.customer_id)
    .eq("company_id", session.company.id)
    .maybeSingle();
  const customer = customerData as Customer | null;
  if (!customer) {
    return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
  }

  const { data: itemsData } = await supabase
    .from("quotation_items")
    .select("*, products(sku)")
    .eq("quotation_id", quotation.id)
    .order("created_at");
  const items = ((itemsData ?? []) as (QuotationItem & { products: Pick<Product, "sku"> | null })[]).map((item) => ({
    ...item,
    sku: item.products?.sku ?? null,
  }));

  const buffer = await renderToBuffer(
    <QuotationPdfDocument company={session.company} customer={customer} quotation={quotation} items={items} />
  );

  await writeAuditLog({
    companyId: session.company.id,
    userId: session.userId,
    action: AUDIT_ACTIONS.PDF_GENERATED,
    entityType: "quotation",
    entityId: quotation.id,
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="devis-${quotation.quotation_number}.pdf"`,
    },
  });
}
