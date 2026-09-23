import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Owners-association service-charge invoice. Layout matches the client's
 * reference document: logo on the left, association letterhead on the
 * right, then the two owner/association boxes and the charge table.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 36,
    paddingBottom: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#000000",
  },
  letterhead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  logo: {
    width: 118,
    height: 82,
    objectFit: "contain",
  },
  letterheadBlock: {
    flexGrow: 1,
    paddingLeft: 16,
    alignItems: "flex-end",
  },
  letterheadText: {
    textAlign: "right",
    fontSize: 9.5,
    lineHeight: 1.35,
  },
  letterheadName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 1,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 12,
  },
  boxRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  box: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#000000",
    paddingVertical: 8,
    paddingHorizontal: 8,
    minHeight: 72,
  },
  boxLine: { marginBottom: 2, lineHeight: 1.35 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  metaLabel: { fontFamily: "Helvetica-Bold" },
  associationLine: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    marginBottom: 8,
  },
  unitInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#000000",
    borderBottomWidth: 0,
    padding: 6,
  },
  unitInfoCol: { gap: 2 },
  table: {
    borderWidth: 1,
    borderColor: "#000000",
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    backgroundColor: "#F2F2F2",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
  },
  cellHeader: {
    padding: 5,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
  },
  cell: {
    padding: 5,
    fontSize: 8.5,
  },
  colDescription: { width: "40%" },
  colFund: { width: "24%" },
  colRate: { width: "12%", textAlign: "right" },
  colQty: { width: "8%", textAlign: "right" },
  colTotal: { width: "16%", textAlign: "right" },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
    padding: 6,
  },
  summaryLabel: { fontFamily: "Helvetica-Bold" },
  payableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#000000",
    padding: 8,
    marginTop: 4,
  },
  payableLabel: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  payableAmount: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  note: {
    marginTop: 10,
    fontFamily: "Helvetica-Oblique",
    fontSize: 8.5,
  },
  dashedRule: {
    marginTop: 24,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "#000000",
    borderStyle: "dashed",
  },
  payTo: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    marginBottom: 10,
  },
  footerRow: {
    flexDirection: "row",
    gap: 16,
  },
  footerCol: { flex: 1, fontSize: 8.5 },
  footerHeading: { fontFamily: "Helvetica-Bold", marginBottom: 3 },
  bankLine: { marginBottom: 1 },
});

export function ServiceChargeInvoiceDocument({
  logoSrc,
  associationName,
  letterheadAddressLines,
  associationRegistrationNumber,
  associationPhone,
  ownerName,
  ownerAddress,
  invoiceNumber,
  issueDate,
  dueDate,
  unitNo,
  entitlements,
  previousBalance,
  currentAmount,
  amountPayable,
  isCredit,
  periodLabel,
  chequePayableTo,
  poBox,
  postalCode,
  area,
  bankName,
  bankSwiftCode,
  bankAccountNumber,
  paymentReference,
  fundLabel,
  graceDays,
  installmentLabel,
}: {
  logoSrc: string | null;
  associationName: string;
  letterheadAddressLines: string[];
  associationRegistrationNumber: string | null;
  associationPhone: string | null;
  ownerName: string;
  ownerAddress: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  unitNo: string;
  entitlements: string;
  previousBalance: string;
  currentAmount: string;
  amountPayable: string;
  isCredit: boolean;
  periodLabel: string;
  chequePayableTo: string | null;
  poBox: string | null;
  postalCode: string | null;
  area: string | null;
  bankName: string | null;
  bankSwiftCode: string | null;
  bankAccountNumber: string | null;
  paymentReference: string | null;
  fundLabel: string;
  graceDays: number;
  installmentLabel?: string;
}) {
  const ownerLines = ownerAddress
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <Document title={`Invoice ${invoiceNumber}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.letterhead}>
          {logoSrc ? (
            <Image src={logoSrc} style={styles.logo} />
          ) : (
            <View style={styles.logo} />
          )}
          <View style={styles.letterheadBlock}>
            <Text style={[styles.letterheadText, styles.letterheadName]}>
              {associationName}
            </Text>
            {letterheadAddressLines.map((line) => (
              <Text key={line} style={styles.letterheadText}>
                {line}
              </Text>
            ))}
            {associationRegistrationNumber ? (
              <Text style={styles.letterheadText}>
                Regn #: {associationRegistrationNumber}
              </Text>
            ) : null}
            {associationPhone ? (
              <Text style={styles.letterheadText}>Phone: {associationPhone}</Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.title}>COMMON OWNER GROUP SERVICE CHARGES</Text>
        <Text style={styles.subtitle}>
          {installmentLabel ? installmentLabel : "Invoice"}
        </Text>

        <View style={styles.boxRow}>
          <View style={styles.box}>
            <Text style={styles.boxLine}>{ownerName}</Text>
            {ownerLines.map((line) => (
              <Text key={line} style={styles.boxLine}>
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.box}>
            <Text style={[styles.boxLine, { fontFamily: "Helvetica-Bold" }]}>
              {associationName}
            </Text>
            {letterheadAddressLines.map((line) => (
              <Text key={`box-${line}`} style={styles.boxLine}>
                {line}
              </Text>
            ))}
            <View style={styles.metaRow}>
              <Text>
                <Text style={styles.metaLabel}>Invoice No: </Text>
                {invoiceNumber}
              </Text>
              <Text>
                <Text style={styles.metaLabel}>Issue Date: </Text>
                {issueDate}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Amount Payable:</Text>
              <Text>{amountPayable}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Due Date:</Text>
              <Text>
                {dueDate}
                {graceDays > 0 ? ` (${graceDays} days' grace)` : ""}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.associationLine}>
          Common Owner Group for {associationName}
        </Text>

        <View style={styles.unitInfoRow}>
          <View style={styles.unitInfoCol}>
            <Text>
              <Text style={styles.metaLabel}>Unit No. </Text>
              {unitNo}
            </Text>
            <Text>
              <Text style={styles.metaLabel}>Unit Entitlements: </Text>
              {entitlements}
            </Text>
          </View>
          <View style={styles.unitInfoCol}>
            <Text>
              <Text style={styles.metaLabel}>Previous Balance: </Text>
              {previousBalance}
            </Text>
            <Text>
              <Text style={styles.metaLabel}>Penalty: </Text>
              0.000
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellHeader, styles.colDescription]}>
              Description
            </Text>
            <Text style={[styles.cellHeader, styles.colFund]}>Fund</Text>
            <Text style={[styles.cellHeader, styles.colRate]}>Unit rate</Text>
            <Text style={[styles.cellHeader, styles.colQty]}>Qty</Text>
            <Text style={[styles.cellHeader, styles.colTotal]}>Totals</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.cell, styles.colDescription]}>
              Service Charge For the period of ({periodLabel})
            </Text>
            <Text style={[styles.cell, styles.colFund]}>{fundLabel}</Text>
            <Text style={[styles.cell, styles.colRate]}>{currentAmount}</Text>
            <Text style={[styles.cell, styles.colQty]}>1</Text>
            <Text style={[styles.cell, styles.colTotal]}>{currentAmount}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Current Invoice Amount</Text>
          <Text>{currentAmount}</Text>
        </View>
        {isCredit && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Credit at time of printing:</Text>
            <Text>{previousBalance}</Text>
          </View>
        )}

        <View style={styles.payableRow}>
          <Text style={styles.payableLabel}>Amount Payable</Text>
          <Text style={styles.payableAmount}>{amountPayable}</Text>
        </View>

        <View style={styles.dashedRule} />
        {chequePayableTo && (
          <Text style={styles.payTo}>
            Please make cheques payable to: {chequePayableTo}
          </Text>
        )}

        <View style={styles.footerRow}>
          <View style={styles.footerCol}>
            <Text style={styles.footerHeading}>How to Pay</Text>
            {poBox && (
              <Text>
                By post: Mail this slip with your cheque to P.O. Box {poBox}
                {postalCode ? `, Postal Code ${postalCode}` : ""}
                {area ? `, ${area}` : ""}, Muscat, Oman.
              </Text>
            )}
          </View>
          <View style={styles.footerCol}>
            <Text style={styles.footerHeading}>{associationName}</Text>
            <Text style={styles.bankLine}>Invoice No: {invoiceNumber}</Text>
            <Text style={styles.bankLine}>Amount Payable: {amountPayable}</Text>
            <Text style={styles.bankLine}>Due Date: {dueDate}</Text>
          </View>
        </View>

        {(bankName || bankSwiftCode || bankAccountNumber || paymentReference) && (
          <View style={{ marginTop: 12 }}>
            {bankName && <Text style={styles.bankLine}>Bank: {bankName}</Text>}
            {bankSwiftCode && (
              <Text style={styles.bankLine}>SWIFT Code: {bankSwiftCode}</Text>
            )}
            {bankAccountNumber && (
              <Text style={styles.bankLine}>
                Account No.: {bankAccountNumber}
              </Text>
            )}
            {paymentReference && (
              <Text style={styles.bankLine}>Reference: {paymentReference}</Text>
            )}
          </View>
        )}
      </Page>
    </Document>
  );
}
