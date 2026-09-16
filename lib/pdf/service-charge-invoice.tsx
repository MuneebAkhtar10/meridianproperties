import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * A formal owner service-charge invoice — deliberately kept close to the
 * plain, professional look of the reference document (a real Rawazen
 * invoice the client sent) rather than this app's own indigo theme, since
 * it's a document that goes out to owners for payment, not an internal
 * screen.
 */

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#000000",
  },
  letterhead: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 16,
  },
  letterheadText: {
    textAlign: "right",
    fontSize: 9,
  },
  letterheadName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 12,
  },
  boxRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  box: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#000000",
    padding: 8,
  },
  boxLine: { marginBottom: 2 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
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
  associationName,
  associationAddress,
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
}: {
  associationName: string;
  associationAddress: string;
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
}) {
  return (
    <Document title={`Invoice ${invoiceNumber}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.letterhead}>
          <View>
            <Text style={[styles.letterheadText, styles.letterheadName]}>
              {associationName}
            </Text>
            <Text style={styles.letterheadText}>{associationAddress}</Text>
            {associationRegistrationNumber && (
              <Text style={styles.letterheadText}>
                Regn #: {associationRegistrationNumber}
              </Text>
            )}
            {associationPhone && (
              <Text style={styles.letterheadText}>
                Phone: {associationPhone}
              </Text>
            )}
          </View>
        </View>

        <Text style={styles.title}>COMMON OWNER GROUP SERVICE CHARGES</Text>
        <Text style={styles.subtitle}>Invoice</Text>

        <View style={styles.boxRow}>
          <View style={styles.box}>
            <Text style={styles.boxLine}>{ownerName}</Text>
            <Text style={styles.boxLine}>{ownerAddress}</Text>
          </View>
          <View style={styles.box}>
            <Text style={[styles.boxLine, { fontFamily: "Helvetica-Bold" }]}>
              {associationName}
            </Text>
            <Text style={styles.boxLine}>{associationAddress}</Text>
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
