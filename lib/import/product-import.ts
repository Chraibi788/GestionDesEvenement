import * as XLSX from "xlsx";
import { productImportRowSchema, type ProductImportRow } from "@/lib/validation/schemas";

export const IMPORT_FIELDS = [
  "sku",
  "name",
  "description",
  "brand",
  "category",
  "unit",
  "packaging",
  "purchase_price",
  "base_sale_price",
  "minimum_sale_price",
  "stock_quantity",
  "technical_keywords",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMapping = Partial<Record<ImportField, string>>;

const FIELD_LABELS: Record<ImportField, string> = {
  sku: "SKU",
  name: "Nom",
  description: "Description",
  brand: "Marque",
  category: "Catégorie",
  unit: "Unité",
  packaging: "Conditionnement",
  purchase_price: "Prix d'achat",
  base_sale_price: "Prix de vente",
  minimum_sale_price: "Prix de vente minimum",
  stock_quantity: "Stock",
  technical_keywords: "Mots-clés techniques",
};

export function fieldLabel(field: ImportField) {
  return FIELD_LABELS[field];
}

const HEADER_ALIASES: Record<ImportField, string[]> = {
  sku: ["sku", "code", "reference", "référence"],
  name: ["name", "nom", "designation", "désignation", "product name"],
  description: ["description", "desc"],
  brand: ["brand", "marque"],
  category: ["category", "categorie", "catégorie"],
  unit: ["unit", "unite", "unité"],
  packaging: ["packaging", "conditionnement", "emballage"],
  purchase_price: ["purchase_price", "prix d'achat", "prix achat", "cost", "cout", "coût"],
  base_sale_price: ["base_sale_price", "prix de vente", "prix vente", "price", "sale price"],
  minimum_sale_price: ["minimum_sale_price", "prix minimum", "prix de vente minimum", "min price"],
  stock_quantity: ["stock_quantity", "stock", "quantite", "quantité", "qty"],
  technical_keywords: ["technical_keywords", "mots-cles", "mots clés", "keywords", "mots-clés techniques"],
};

export interface ParsedWorkbook {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseSpreadsheet(data: ArrayBuffer): ParsedWorkbook {
  const workbook = XLSX.read(data, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });

  if (raw.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = raw[0].map((h) => String(h ?? "").trim());
  const rows = raw.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = row[i] === undefined || row[i] === null ? "" : String(row[i]).trim();
    });
    return record;
  });

  return { headers, rows };
}

export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalizedHeaders = headers.map((h) => ({ original: h, normalized: h.toLowerCase().trim() }));

  for (const field of IMPORT_FIELDS) {
    const aliases = HEADER_ALIASES[field];
    const match = normalizedHeaders.find((h) => aliases.includes(h.normalized));
    if (match) {
      mapping[field] = match.original;
    }
  }

  return mapping;
}

export interface ImportRowResult {
  rowNumber: number;
  data: ProductImportRow | null;
  errors: string[];
  action: "create" | "update" | "error";
}

export interface ImportSummary {
  created: number;
  updated: number;
  ignored: number;
  errors: number;
}

/**
 * Validates and classifies every row from the raw sheet against the chosen
 * column mapping. `existingSkus` lets the caller (client preview or server
 * commit) distinguish create vs update without a second round trip; it is
 * never trusted for the actual write — the API route re-checks server-side.
 */
export function validateImportRows(
  rawRows: Record<string, string>[],
  mapping: ColumnMapping,
  existingSkus: Set<string>
): { results: ImportRowResult[]; summary: ImportSummary } {
  const results: ImportRowResult[] = [];
  const seenSkus = new Set<string>();

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2; // +1 for header row, +1 for 1-indexing
    const mapped: Record<string, string> = {};
    for (const field of IMPORT_FIELDS) {
      const sourceCol = mapping[field];
      mapped[field] = sourceCol ? (raw[sourceCol] ?? "") : "";
    }

    const parsed = productImportRowSchema.safeParse(mapped);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      results.push({ rowNumber, data: null, errors, action: "error" });
      return;
    }

    const sku = parsed.data.sku;
    if (seenSkus.has(sku)) {
      results.push({ rowNumber, data: parsed.data, errors: [`SKU en double dans le fichier: ${sku}`], action: "error" });
      return;
    }
    seenSkus.add(sku);

    const action = existingSkus.has(sku) ? "update" : "create";
    results.push({ rowNumber, data: parsed.data, errors: [], action });
  });

  const summary: ImportSummary = {
    created: results.filter((r) => r.action === "create").length,
    updated: results.filter((r) => r.action === "update").length,
    ignored: 0,
    errors: results.filter((r) => r.action === "error").length,
  };

  return { results, summary };
}
