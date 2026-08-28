import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { productImportRowSchema } from "@/lib/validation/schemas";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";

const requestSchema = z.object({
  rows: z.array(z.record(z.string(), z.string())).max(5000, "Trop de lignes (5000 maximum par import)"),
});

export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsedRequest = requestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const supabase = await createClient();

  // Never trust the client's create/update classification: re-derive it
  // from the current, authoritative set of SKUs for this company.
  const { data: existingProducts } = await supabase
    .from("products")
    .select("sku")
    .eq("company_id", session.company.id);
  const existingSkus = new Set(((existingProducts ?? []) as { sku: string }[]).map((p) => p.sku));

  const seenSkus = new Set<string>();
  const rowErrors: { row: number; errors: string[] }[] = [];
  const toUpsert: Record<string, unknown>[] = [];
  let created = 0;
  let updated = 0;

  parsedRequest.data.rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const parsed = productImportRowSchema.safeParse(raw);

    if (!parsed.success) {
      rowErrors.push({ row: rowNumber, errors: parsed.error.issues.map((i) => i.message) });
      return;
    }

    const { sku } = parsed.data;
    if (seenSkus.has(sku)) {
      rowErrors.push({ row: rowNumber, errors: [`SKU en double dans le fichier: ${sku}`] });
      return;
    }
    seenSkus.add(sku);

    if (parsed.data.minimum_sale_price != null && parsed.data.minimum_sale_price > parsed.data.base_sale_price) {
      rowErrors.push({ row: rowNumber, errors: ["Le prix de vente minimum ne peut pas dépasser le prix de vente"] });
      return;
    }

    if (existingSkus.has(sku)) {
      updated += 1;
    } else {
      created += 1;
    }

    toUpsert.push({
      company_id: session.company.id,
      sku,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      brand: parsed.data.brand ?? null,
      category: parsed.data.category ?? null,
      unit: parsed.data.unit ?? "unit",
      packaging: parsed.data.packaging ?? null,
      purchase_price: parsed.data.purchase_price ?? null,
      base_sale_price: parsed.data.base_sale_price,
      minimum_sale_price: parsed.data.minimum_sale_price ?? null,
      stock_quantity: parsed.data.stock_quantity ?? null,
      technical_keywords: parsed.data.technical_keywords
        ? parsed.data.technical_keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean)
        : null,
    });
  });

  let dbError: string | null = null;
  if (toUpsert.length > 0) {
    const { error } = await supabase.from("products").upsert(toUpsert, { onConflict: "company_id,sku" });
    if (error) {
      dbError = error.message;
    }
  }

  if (dbError) {
    return NextResponse.json({ error: `Échec de l'import: ${dbError}` }, { status: 500 });
  }

  await writeAuditLog({
    companyId: session.company.id,
    userId: session.userId,
    action: AUDIT_ACTIONS.PRODUCTS_IMPORTED,
    entityType: "product_import",
    metadata: { created, updated, ignored: 0, errors: rowErrors.length },
  });

  return NextResponse.json({
    summary: { created, updated, ignored: 0, errors: rowErrors.length },
    rowErrors,
  });
}
