"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  IMPORT_FIELDS,
  autoMapColumns,
  fieldLabel,
  parseSpreadsheet,
  validateImportRows,
  type ColumnMapping,
  type ImportField,
  type ImportRowResult,
  type ParsedWorkbook,
} from "@/lib/import/product-import";

type Step = "upload" | "mapping" | "preview" | "done";

const REQUIRED_FIELDS: ImportField[] = ["sku", "name", "base_sale_price"];

export default function ImportWizard({ existingSkus }: { existingSkus: string[] }) {
  const existingSkuSet = useMemo(() => new Set(existingSkus), [existingSkus]);

  const [step, setStep] = useState<Step>("upload");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [results, setResults] = useState<ImportRowResult[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finalSummary, setFinalSummary] = useState<{ created: number; updated: number; ignored: number; errors: number } | null>(
    null
  );

  async function handleFile(file: File) {
    setParsing(true);
    setParseError(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseSpreadsheet(buffer);
      if (parsed.rows.length === 0) {
        setParseError("Le fichier est vide ou illisible.");
        setParsing(false);
        return;
      }
      setWorkbook(parsed);
      setMapping(autoMapColumns(parsed.headers));
      setStep("mapping");
    } catch {
      setParseError("Impossible de lire ce fichier. Vérifiez le format (CSV ou XLSX).");
    } finally {
      setParsing(false);
    }
  }

  function computePreview() {
    if (!workbook) return;
    const { results: computed } = validateImportRows(workbook.rows, mapping, existingSkuSet);
    setResults(computed);
    setExcluded(new Set());
    setStep("preview");
  }

  const summary = useMemo(() => {
    const created = results.filter((r) => r.action === "create" && !excluded.has(r.rowNumber)).length;
    const updated = results.filter((r) => r.action === "update" && !excluded.has(r.rowNumber)).length;
    const ignored = excluded.size;
    const errors = results.filter((r) => r.action === "error").length;
    return { created, updated, ignored, errors };
  }, [results, excluded]);

  async function handleConfirm() {
    if (!workbook) return;
    setSubmitting(true);
    setSubmitError(null);

    const rows = results
      .filter((r) => r.action !== "error" && !excluded.has(r.rowNumber))
      .map((r) => {
        const raw = workbook.rows[r.rowNumber - 2];
        const mapped: Record<string, string> = {};
        for (const field of IMPORT_FIELDS) {
          const col = mapping[field];
          mapped[field] = col ? (raw[col] ?? "") : "";
        }
        return mapped;
      });

    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error ?? "Erreur lors de l'import.");
        setSubmitting(false);
        return;
      }
      setFinalSummary({ ...json.summary, ignored: summary.ignored });
      setStep("done");
    } catch {
      setSubmitError("Erreur réseau lors de l'import.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "upload") {
    return (
      <div>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-md file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
        />
        {parsing && <p className="mt-2 text-sm text-gray-500">Lecture du fichier...</p>}
        {parseError && <p className="mt-2 text-sm text-red-600">{parseError}</p>}
      </div>
    );
  }

  if (step === "mapping" && workbook) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Associez les colonnes de votre fichier ({workbook.rows.length} lignes détectées) aux champs Khedma AI.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {IMPORT_FIELDS.map((field) => (
            <div key={field}>
              <label className="label">
                {fieldLabel(field)} {REQUIRED_FIELDS.includes(field) && <span className="text-red-500">*</span>}
              </label>
              <select
                className="input"
                value={mapping[field] ?? ""}
                onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value || undefined }))}
              >
                <option value="">-- Ignorer --</option>
                {workbook.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            className="btn-primary"
            disabled={REQUIRED_FIELDS.some((f) => !mapping[f])}
            onClick={computePreview}
          >
            Aperçu
          </button>
          <button className="btn-secondary" onClick={() => setStep("upload")}>
            Retour
          </button>
        </div>
        {REQUIRED_FIELDS.some((f) => !mapping[f]) && (
          <p className="text-xs text-amber-600">SKU, Nom et Prix de vente doivent être associés à une colonne.</p>
        )}
      </div>
    );
  }

  if (step === "preview") {
    return (
      <div className="space-y-4">
        <div className="flex gap-4 text-sm">
          <span className="badge-green">{summary.created} à créer</span>
          <span className="badge-green">{summary.updated} à mettre à jour</span>
          <span className="badge-orange">{summary.ignored} ignorée(s)</span>
          <span className="badge-red">{summary.errors} en erreur</span>
        </div>
        <div className="max-h-96 overflow-auto rounded-md border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Inclure</th>
                <th className="px-3 py-2 text-left">Ligne</th>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-left">Nom</th>
                <th className="px-3 py-2 text-left">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {results.map((r) => (
                <tr key={r.rowNumber} className={r.action === "error" ? "bg-red-50" : ""}>
                  <td className="px-3 py-2">
                    {r.action !== "error" && (
                      <input
                        type="checkbox"
                        checked={!excluded.has(r.rowNumber)}
                        onChange={() =>
                          setExcluded((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.rowNumber)) next.delete(r.rowNumber);
                            else next.add(r.rowNumber);
                            return next;
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">{r.rowNumber}</td>
                  <td className="px-3 py-2 font-mono">{r.data?.sku ?? "—"}</td>
                  <td className="px-3 py-2">{r.data?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.action === "error" ? (
                      <span className="text-red-700">{r.errors.join(", ")}</span>
                    ) : r.action === "create" ? (
                      <span className="badge-green">Création</span>
                    ) : (
                      <span className="badge-orange">Mise à jour</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {submitError && <p className="text-sm text-red-600">{submitError}</p>}
        <div className="flex gap-3">
          <button className="btn-primary" disabled={submitting} onClick={handleConfirm}>
            {submitting ? "Import en cours..." : "Confirmer l'import"}
          </button>
          <button className="btn-secondary" onClick={() => setStep("mapping")}>
            Retour au mapping
          </button>
        </div>
      </div>
    );
  }

  if (step === "done" && finalSummary) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-emerald-700">Import terminé.</p>
        <div className="flex gap-4 text-sm">
          <span className="badge-green">{finalSummary.created} créé(s)</span>
          <span className="badge-green">{finalSummary.updated} mis à jour</span>
          <span className="badge-orange">{finalSummary.ignored} ignoré(s)</span>
          <span className="badge-red">{finalSummary.errors} erreur(s)</span>
        </div>
        <Link href="/products" className="btn-primary inline-flex">
          Voir les produits
        </Link>
      </div>
    );
  }

  return null;
}
