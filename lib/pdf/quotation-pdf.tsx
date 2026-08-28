import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Company, Customer, Quotation, QuotationItem } from "@/types/database";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#1f2937" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  companyName: { fontSize: 16, fontWeight: 700, color: "#1e423d" },
  small: { fontSize: 8, color: "#4b5563" },
  quoteTitle: { fontSize: 14, fontWeight: 700, textAlign: "right" },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 9, fontWeight: 700, marginBottom: 4, color: "#374151" },
  twoCol: { flexDirection: "row", justifyContent: "space-between" },
  table: { display: "flex", width: "100%", marginTop: 8, borderTop: "1pt solid #d1d5db" },
  tr: { flexDirection: "row", borderBottom: "1pt solid #e5e7eb", paddingVertical: 4 },
  th: { fontWeight: 700, backgroundColor: "#f3f4f6", paddingVertical: 5 },
  cDesc: { width: "34%", paddingHorizontal: 4 },
  cQty: { width: "10%", paddingHorizontal: 4, textAlign: "right" },
  cUnit: { width: "10%", paddingHorizontal: 4 },
  cPrice: { width: "14%", paddingHorizontal: 4, textAlign: "right" },
  cDiscount: { width: "10%", paddingHorizontal: 4, textAlign: "right" },
  cNet: { width: "12%", paddingHorizontal: 4, textAlign: "right" },
  cTotal: { width: "10%", paddingHorizontal: 4, textAlign: "right" },
  totalsBlock: { marginTop: 12, alignSelf: "flex-end", width: 220 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalsRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    marginTop: 4,
    borderTop: "1pt solid #1e423d",
    fontWeight: 700,
    fontSize: 11,
  },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, textAlign: "center", fontSize: 7, color: "#9ca3af" },
  notes: { marginTop: 16, fontSize: 8, color: "#4b5563" },
});

function money(value: number, currency: string) {
  return `${value.toFixed(2)} ${currency}`;
}

export function QuotationPdfDocument({
  company,
  customer,
  quotation,
  items,
}: {
  company: Company;
  customer: Customer;
  quotation: Quotation;
  items: (QuotationItem & { sku?: string | null })[];
}) {
  return (
    <Document title={`Devis ${quotation.quotation_number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.companyName}>{company.name}</Text>
            {company.legal_name && <Text style={styles.small}>{company.legal_name}</Text>}
            {company.address && <Text style={styles.small}>{company.address}</Text>}
            {(company.city || company.country) && (
              <Text style={styles.small}>{[company.city, company.country].filter(Boolean).join(", ")}</Text>
            )}
            {company.phone && <Text style={styles.small}>Tél: {company.phone}</Text>}
            {company.email && <Text style={styles.small}>{company.email}</Text>}
            {company.ice && <Text style={styles.small}>ICE: {company.ice}</Text>}
          </View>
          <View>
            <Text style={styles.quoteTitle}>DEVIS</Text>
            <Text style={{ textAlign: "right", marginTop: 4 }}>{quotation.quotation_number}</Text>
            <Text style={[styles.small, { textAlign: "right" }]}>
              Date: {new Date(quotation.created_at).toLocaleDateString("fr-FR")}
            </Text>
            {quotation.valid_until && (
              <Text style={[styles.small, { textAlign: "right" }]}>
                Valable jusqu&apos;au: {new Date(quotation.valid_until).toLocaleDateString("fr-FR")}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Client</Text>
          <Text>{customer.name}</Text>
          {customer.legal_name && <Text style={styles.small}>{customer.legal_name}</Text>}
          {customer.address && <Text style={styles.small}>{customer.address}</Text>}
          {customer.city && <Text style={styles.small}>{customer.city}</Text>}
          {customer.ice && <Text style={styles.small}>ICE: {customer.ice}</Text>}
        </View>

        <View style={styles.table}>
          <View style={[styles.tr, styles.th]} fixed>
            <Text style={styles.cDesc}>Désignation</Text>
            <Text style={styles.cQty}>Qté</Text>
            <Text style={styles.cUnit}>Unité</Text>
            <Text style={styles.cPrice}>Prix unit.</Text>
            <Text style={styles.cDiscount}>Remise</Text>
            <Text style={styles.cNet}>Prix net</Text>
            <Text style={styles.cTotal}>Total</Text>
          </View>
          {items.map((item) => (
            <View style={styles.tr} key={item.id} wrap={false}>
              <Text style={styles.cDesc}>
                {item.description}
                {item.sku ? ` (${item.sku})` : ""}
              </Text>
              <Text style={styles.cQty}>{item.quantity}</Text>
              <Text style={styles.cUnit}>{item.unit}</Text>
              <Text style={styles.cPrice}>{item.unit_price.toFixed(2)}</Text>
              <Text style={styles.cDiscount}>{item.discount_percent.toFixed(1)}%</Text>
              <Text style={styles.cNet}>{item.net_unit_price.toFixed(2)}</Text>
              <Text style={styles.cTotal}>{item.line_subtotal.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text>Sous-total HT</Text>
            <Text>{money(quotation.subtotal, quotation.currency)}</Text>
          </View>
          {quotation.discount_total > 0 && (
            <View style={styles.totalsRow}>
              <Text>Remise totale</Text>
              <Text>{money(quotation.discount_total, quotation.currency)}</Text>
            </View>
          )}
          <View style={styles.totalsRow}>
            <Text>TVA ({quotation.vat_rate}%)</Text>
            <Text>{money(quotation.vat_amount, quotation.currency)}</Text>
          </View>
          <View style={styles.totalsRowFinal}>
            <Text>Total TTC</Text>
            <Text>{money(quotation.total, quotation.currency)}</Text>
          </View>
        </View>

        <View style={styles.notes}>
          {quotation.payment_terms && <Text>Conditions de paiement: {quotation.payment_terms}</Text>}
          {quotation.delivery_terms && <Text>Conditions de livraison: {quotation.delivery_terms}</Text>}
          {quotation.notes && <Text style={{ marginTop: 6 }}>{quotation.notes}</Text>}
        </View>

        <Text style={styles.footer} fixed>
          Document généré via Khedma AI
        </Text>
      </Page>
    </Document>
  );
}
