import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Spec #36 "Building Management Summary Report" — the Darsait-style
 * Rental Collection / Less Expense / Final Position reconciliation,
 * printable for one property over one period. Mirrors the color palette
 * and table idiom used across this app's other PDFs.
 */

const COLORS = {
  primary: "#5048E5",
  primaryDark: "#2F29A3",
  emerald: "#10B981",
  rose: "#F43F5E",
  muted: "#F4F4F5",
  mutedForeground: "#6F6F7B",
  border: "#E4E4E7",
  foreground: "#1C1C22",
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: COLORS.foreground },
  headerBar: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingBottom: 10,
    marginBottom: 14,
  },
  titleText: { fontSize: 15, fontFamily: "Helvetica-Bold", color: COLORS.primary },
  subtitleText: { fontSize: 9, color: COLORS.mutedForeground, marginTop: 2 },
  sectionHeader: {
    backgroundColor: "#EEEDFC",
    padding: 6,
    marginTop: 14,
  },
  sectionHeaderText: { fontFamily: "Helvetica-Bold", color: COLORS.primaryDark, fontSize: 10 },
  table: { borderWidth: 1, borderColor: COLORS.border, borderTopWidth: 0 },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: COLORS.muted,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  totalRow: {
    flexDirection: "row",
    backgroundColor: COLORS.muted,
  },
  cellHeader: {
    padding: 5,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
  },
  cell: { padding: 5, fontSize: 8.5 },
  cellBold: { padding: 5, fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  colDescription: { width: "60%" },
  colUnits: { width: "20%", textAlign: "right" },
  colAmount: { width: "20%", textAlign: "right" },
  finalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    padding: 10,
    borderRadius: 5,
  },
  finalLabel: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#FFFFFF" },
  finalValue: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#FFFFFF" },
  generatedAt: { marginTop: 12, fontSize: 7.5, color: COLORS.mutedForeground },
});

export type ReportPdfLine = { description: string; unitCount: number; amount: string };

function ReportTable({
  rows,
  totalRow,
}: {
  rows: ReportPdfLine[];
  totalRow: ReportPdfLine;
}) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.cellHeader, styles.colDescription]}>Description</Text>
        <Text style={[styles.cellHeader, styles.colUnits]}>No of Units</Text>
        <Text style={[styles.cellHeader, styles.colAmount]}>Amount</Text>
      </View>
      {rows.map((row, i) => (
        <View style={styles.tableRow} key={i}>
          <Text style={[styles.cell, styles.colDescription]}>{row.description}</Text>
          <Text style={[styles.cell, styles.colUnits]}>{row.unitCount}</Text>
          <Text style={[styles.cell, styles.colAmount]}>{row.amount}</Text>
        </View>
      ))}
      <View style={styles.totalRow}>
        <Text style={[styles.cellBold, styles.colDescription]}>{totalRow.description}</Text>
        <Text style={[styles.cellBold, styles.colUnits]}>{totalRow.unitCount}</Text>
        <Text style={[styles.cellBold, styles.colAmount]}>{totalRow.amount}</Text>
      </View>
    </View>
  );
}

export function BuildingManagementReportDocument({
  propertyName,
  periodLabel,
  rentalRows,
  rentalTotal,
  expenseRows,
  expenseTotal,
  totalRentalCollection,
  totalExpense,
  finalBalanceLabel,
  finalBalance,
  generatedAt,
}: {
  propertyName: string;
  periodLabel: string;
  rentalRows: ReportPdfLine[];
  rentalTotal: ReportPdfLine;
  expenseRows: ReportPdfLine[];
  expenseTotal: ReportPdfLine;
  totalRentalCollection: string;
  totalExpense: string;
  finalBalanceLabel: string;
  finalBalance: string;
  generatedAt: string;
}) {
  const isOwedToLandlord = finalBalanceLabel === "Balance Amount to Landlord";

  return (
    <Document title={`Building Management Summary Report — ${propertyName}`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerBar}>
          <Text style={styles.titleText}>Building Management Summary Report</Text>
          <Text style={styles.subtitleText}>
            {propertyName} · {periodLabel}
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Rental Collection</Text>
        </View>
        <ReportTable rows={rentalRows} totalRow={rentalTotal} />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Less Expense</Text>
        </View>
        <ReportTable rows={expenseRows} totalRow={expenseTotal} />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Final Position</Text>
        </View>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={[styles.cell, { width: "70%" }]}>Total Rental Collection</Text>
            <Text style={[styles.cell, { width: "30%", textAlign: "right" }]}>
              OMR {totalRentalCollection}
            </Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.cell, { width: "70%" }]}>Total Expense</Text>
            <Text style={[styles.cell, { width: "30%", textAlign: "right" }]}>
              (OMR {totalExpense})
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.finalRow,
            { backgroundColor: isOwedToLandlord ? COLORS.emerald : COLORS.rose },
          ]}
        >
          <Text style={styles.finalLabel}>{finalBalanceLabel}</Text>
          <Text style={styles.finalValue}>OMR {finalBalance}</Text>
        </View>

        <Text style={styles.generatedAt}>Generated {generatedAt}</Text>
      </Page>
    </Document>
  );
}
