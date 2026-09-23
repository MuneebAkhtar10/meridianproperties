import { Document, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";

import { RAWAZEN_SERVICES } from "@/lib/rawazen-company";

const money = new Intl.NumberFormat("en-OM", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function omr(value: number): string {
  return `${money.format(value)}OMR`;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingHorizontal: 42,
    paddingBottom: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#111111",
  },
  paid: {
    textAlign: "center",
    color: "#E11D48",
    fontFamily: "Helvetica-Bold",
    fontSize: 22,
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  titleBadge: {
    backgroundColor: "#5B9BD5",
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  titleBadgeText: {
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    letterSpacing: 0.6,
  },
  titleRule: {
    flex: 1,
    height: 2,
    backgroundColor: "#111111",
    marginLeft: 0,
  },
  metaLogoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  metaLabel: {
    width: 72,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  companyBlock: {
    marginBottom: 14,
    lineHeight: 1.35,
  },
  companyName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginBottom: 2,
  },
  billToLabel: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  billTo: {
    marginBottom: 14,
    lineHeight: 1.35,
  },
  table: {
    borderWidth: 1,
    borderColor: "#111111",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#111111",
  },
  th: {
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#111111",
    minHeight: 28,
  },
  td: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontSize: 8.5,
  },
  colQty: { width: "10%" },
  colItem: { width: "18%" },
  colDesc: { width: "42%" },
  colPrice: { width: "15%", textAlign: "right" },
  colTotal: { width: "15%", textAlign: "right" },
  stripe: { backgroundColor: "#F3F4F6" },
  filler: { minHeight: 120 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
    marginBottom: 18,
  },
  totalLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginRight: 18,
  },
  totalValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    minWidth: 90,
    textAlign: "right",
  },
  bank: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    lineHeight: 1.4,
    marginBottom: 12,
  },
  contact: {
    fontSize: 8,
    marginBottom: 10,
    lineHeight: 1.35,
  },
  thanks: {
    fontSize: 9,
    marginBottom: 14,
  },
  footerRule: {
    height: 3,
    backgroundColor: "#111111",
  },
});

function Logo() {
  return (
    <Svg width={54} height={42} viewBox="0 0 54 42">
      <Path d="M4 38 L20 10 L28 38 Z" fill="#2563EB" />
      <Path d="M26 38 L38 8 L50 38 Z" fill="#F59E0B" />
    </Svg>
  );
}

export function ServicesInvoiceDocument({
  invoiceNumber,
  issueDate,
  billedName,
  billedAddress,
  lines,
  paid,
}: {
  invoiceNumber: string;
  issueDate: string;
  billedName: string;
  billedAddress: string;
  lines: { qty: number; item: string; description: string; unitPrice: number }[];
  paid: boolean;
}) {
  const total = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const minRows = Math.max(lines.length, 6);

  return (
    <Document title={`Invoice ${invoiceNumber}`}>
      <Page size="A4" style={styles.page}>
        {paid ? <Text style={styles.paid}>Paid</Text> : <View style={{ height: 32 }} />}

        <View style={styles.titleRow}>
          <View style={styles.titleBadge}>
            <Text style={styles.titleBadgeText}>INVOICE</Text>
          </View>
          <View style={styles.titleRule} />
        </View>

        <View style={styles.metaLogoRow}>
          <View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date:</Text>
              <Text>{issueDate}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice No.:</Text>
              <Text>{invoiceNumber}</Text>
            </View>
          </View>
          <Logo />
        </View>

        <View style={styles.companyBlock}>
          <Text style={styles.companyName}>{RAWAZEN_SERVICES.name}</Text>
          <Text>CR - {RAWAZEN_SERVICES.cr}</Text>
          <Text>
            P.O.Box - {RAWAZEN_SERVICES.poBox}, Postal Code.{RAWAZEN_SERVICES.postalCode},
          </Text>
          <Text>{RAWAZEN_SERVICES.locality}</Text>
          <Text>{RAWAZEN_SERVICES.phone}</Text>
        </View>

        <View style={styles.billTo}>
          <Text style={styles.billToLabel}>Bill To</Text>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{billedName}</Text>
          {billedAddress.split("\n").map((line, index) => (
            <Text key={index}>{line}</Text>
          ))}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colItem]}>Item</Text>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colPrice]}>Unit Price</Text>
            <Text style={[styles.th, styles.colTotal]}>Total</Text>
          </View>
          {Array.from({ length: minRows }).map((_, index) => {
            const line = lines[index];
            const stripe = index % 2 === 1;
            return (
              <View
                key={index}
                style={[styles.tr, stripe ? styles.stripe : {}, index === minRows - 1 ? { borderBottomWidth: 0 } : {}]}
              >
                <Text style={[styles.td, styles.colQty]}>{line ? String(line.qty) : " "}</Text>
                <Text style={[styles.td, styles.colItem]}>{line?.item ?? " "}</Text>
                <Text style={[styles.td, styles.colDesc]}>{line?.description ?? " "}</Text>
                <Text style={[styles.td, styles.colPrice]}>
                  {line ? omr(line.unitPrice) : " "}
                </Text>
                <Text style={[styles.td, styles.colTotal]}>
                  {line ? omr(line.qty * line.unitPrice) : " "}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{omr(total)}</Text>
        </View>

        <View style={styles.bank}>
          <Text>{RAWAZEN_SERVICES.name.toUpperCase()}</Text>
          <Text>{RAWAZEN_SERVICES.bankAccountNumber}</Text>
          <Text>{RAWAZEN_SERVICES.bankName}</Text>
        </View>

        <Text style={styles.contact}>
          If you have any questions concerning this invoice, use the following contact information:{"\n"}
          Contact - {RAWAZEN_SERVICES.contactName}, Phone - {RAWAZEN_SERVICES.contactPhone}, Email -{" "}
          {RAWAZEN_SERVICES.contactEmail}
        </Text>

        <Text style={styles.thanks}>Thank you for your business.</Text>
        <View style={styles.footerRule} />
      </Page>
    </Document>
  );
}
