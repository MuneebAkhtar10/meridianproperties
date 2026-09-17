import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * A single tenancy's rent statement — matches the layout of Rawazen's
 * existing per-unit statement documents: Building/Owner info, Resident/
 * Tenant info, a month-by-month rent collection log, the unit's expenses,
 * and the resulting balance.
 */

const COLORS = {
  primary: "#5048E5",
  primaryDark: "#2F29A3",
  accentBg: "#EEEDFC",
  stripe: "#FAFAFB",
  emerald: "#10B981",
  rose: "#F43F5E",
  muted: "#F4F4F5",
  mutedForeground: "#6F6F7B",
  border: "#E4E4E7",
  foreground: "#1C1C22",
};

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: COLORS.foreground },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingBottom: 12,
    marginBottom: 16,
  },
  titleText: { fontSize: 16, fontFamily: "Helvetica-Bold", color: COLORS.primary },
  subtitleText: { fontSize: 9.5, color: COLORS.mutedForeground, marginTop: 3 },
  metaLabel: {
    fontSize: 7,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "right",
  },
  metaText: { fontSize: 8, color: COLORS.mutedForeground, textAlign: "right" },
  sectionHeader: {
    backgroundColor: COLORS.accentBg,
    padding: 7,
    marginTop: 16,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  sectionHeaderText: {
    fontFamily: "Helvetica-Bold",
    color: COLORS.primaryDark,
    fontSize: 10.5,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 0,
  },
  infoCell: {
    width: "50%",
    padding: 8,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  infoLabel: {
    fontSize: 7,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 2 },
  table: { borderWidth: 1, borderColor: COLORS.border, borderTopWidth: 0 },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: COLORS.muted,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tableRowStripe: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.stripe,
  },
  totalRow: {
    flexDirection: "row",
    backgroundColor: COLORS.accentBg,
  },
  cellHeader: {
    padding: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  cell: { padding: 6, fontSize: 8.5 },
  cellBold: {
    padding: 6,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primaryDark,
  },
  emptyCell: {
    padding: 8,
    fontSize: 8.5,
    color: COLORS.mutedForeground,
    fontFamily: "Helvetica-Oblique",
  },
  finalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    padding: 11,
    borderRadius: 6,
  },
  finalLabel: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#FFFFFF" },
  finalValue: { fontFamily: "Helvetica-Bold", fontSize: 13, color: "#FFFFFF" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
  },
  footerText: { fontSize: 7.5, color: COLORS.mutedForeground },
});

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCell}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export type RentStatementPdfMonthRow = {
  month: string;
  transactionDate: string;
  amount: string;
  receivedBy: string;
};

export type RentStatementPdfExpenseRow = { description: string; amount: string };

export function UnitRentStatementDocument({
  propertyName,
  periodLabel,
  buildingInfo,
  tenantInfo,
  monthlyRows,
  expenseRows,
  totalRentCollected,
  totalExpenses,
  balanceLabel,
  balance,
  generatedAt,
}: {
  propertyName: string;
  periodLabel: string;
  buildingInfo: { label: string; value: string }[];
  tenantInfo: { label: string; value: string }[];
  monthlyRows: RentStatementPdfMonthRow[];
  expenseRows: RentStatementPdfExpenseRow[];
  totalRentCollected: string;
  totalExpenses: string;
  balanceLabel: string;
  balance: string;
  generatedAt: string;
}) {
  const isOwedToLandlord = balanceLabel.startsWith("Balance Amount to Landlord");

  return (
    <Document title={`Rent Statement — ${propertyName}`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerBar}>
          <View>
            <Text style={styles.titleText}>Unit Rent Statement</Text>
            <Text style={styles.subtitleText}>
              {propertyName} · {periodLabel}
            </Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Generated</Text>
            <Text style={styles.metaText}>{generatedAt}</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Building / Owner Information</Text>
        </View>
        <View style={styles.infoGrid}>
          {buildingInfo.map((item, i) => (
            <InfoCell key={i} label={item.label} value={item.value} />
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Resident / Tenant Information</Text>
        </View>
        <View style={styles.infoGrid}>
          {tenantInfo.map((item, i) => (
            <InfoCell key={i} label={item.label} value={item.value} />
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Rental Collection</Text>
        </View>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellHeader, { width: "20%" }]}>Month</Text>
            <Text style={[styles.cellHeader, { width: "25%" }]}>Transaction Date</Text>
            <Text style={[styles.cellHeader, { width: "20%", textAlign: "right" }]}>Amount</Text>
            <Text style={[styles.cellHeader, { width: "35%" }]}>Received By</Text>
          </View>
          {monthlyRows.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.emptyCell, { width: "100%" }]}>
                No rent collected against this unit for the period.
              </Text>
            </View>
          ) : (
            monthlyRows.map((row, i) => (
              <View style={i % 2 === 1 ? styles.tableRowStripe : styles.tableRow} key={i}>
                <Text style={[styles.cell, { width: "20%" }]}>{row.month}</Text>
                <Text style={[styles.cell, { width: "25%" }]}>{row.transactionDate}</Text>
                <Text style={[styles.cell, { width: "20%", textAlign: "right" }]}>
                  {row.amount}
                </Text>
                <Text style={[styles.cell, { width: "35%" }]}>{row.receivedBy}</Text>
              </View>
            ))
          )}
          <View style={styles.totalRow}>
            <Text style={[styles.cellBold, { width: "65%" }]}>
              Total Rent Collected with Company
            </Text>
            <Text style={[styles.cellBold, { width: "35%", textAlign: "right" }]}>
              OMR {totalRentCollected}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Expense Sheet</Text>
        </View>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellHeader, { width: "70%" }]}>Description</Text>
            <Text style={[styles.cellHeader, { width: "30%", textAlign: "right" }]}>Amount</Text>
          </View>
          {expenseRows.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.emptyCell, { width: "100%" }]}>
                No expenses logged against this unit for the period.
              </Text>
            </View>
          ) : (
            expenseRows.map((row, i) => (
              <View style={i % 2 === 1 ? styles.tableRowStripe : styles.tableRow} key={i}>
                <Text style={[styles.cell, { width: "70%" }]}>{row.description}</Text>
                <Text style={[styles.cell, { width: "30%", textAlign: "right" }]}>
                  {row.amount}
                </Text>
              </View>
            ))
          )}
          <View style={styles.totalRow}>
            <Text style={[styles.cellBold, { width: "70%" }]}>Total Expenses</Text>
            <Text style={[styles.cellBold, { width: "30%", textAlign: "right" }]}>
              OMR {totalExpenses}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.finalRow,
            { backgroundColor: isOwedToLandlord ? COLORS.emerald : COLORS.rose },
          ]}
        >
          <Text style={styles.finalLabel}>{balanceLabel}</Text>
          <Text style={styles.finalValue}>OMR {balance}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated {generatedAt}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
