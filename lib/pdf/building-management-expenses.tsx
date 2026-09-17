import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Spec #33 "Building Management Expenses" — the flat Unit | Description |
 * Amount table the spec asks for, styled like this app's other expense
 * PDFs (lib/pdf/expense-report.tsx), with the richer supporting fields
 * (Date/Supplier/Category/Paid By/Reference) kept as a second line per
 * item so it still serves as evidence if an owner questions an expense.
 */

const COLORS = {
  primary: "#5048E5",
  primaryDark: "#2F29A3",
  accentBg: "#EEEDFC",
  stripe: "#FAFAFB",
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
  metaText: { fontSize: 8, color: COLORS.mutedForeground, textAlign: "right" },
  metaLabel: {
    fontSize: 7,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "right",
  },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 8,
  },
  statLabel: {
    fontSize: 7,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: COLORS.foreground,
    marginTop: 3,
  },
  unitHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.accentBg,
    padding: 7,
    marginTop: 14,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  unitHeaderLabel: { fontFamily: "Helvetica-Bold", color: COLORS.primaryDark, fontSize: 10.5 },
  unitHeaderCount: { fontSize: 7.5, color: COLORS.primaryDark, marginTop: 1, opacity: 0.75 },
  unitHeaderTotal: { fontFamily: "Helvetica-Bold", fontSize: 11, color: COLORS.primaryDark },
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
  tableRowStripe: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.stripe,
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
  colDescription: { width: "38%" },
  colAmount: { width: "14%", textAlign: "right" },
  colDate: { width: "15%" },
  colCategory: { width: "16%" },
  colPaidBy: { width: "17%" },
  categoryPill: {
    fontSize: 7,
    color: COLORS.primaryDark,
    backgroundColor: COLORS.accentBg,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  sub: { fontSize: 7, color: COLORS.mutedForeground, marginTop: 2 },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    padding: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
  },
  grandTotalLabel: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#FFFFFF" },
  grandTotalValue: { fontFamily: "Helvetica-Bold", fontSize: 13, color: "#FFFFFF" },
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

export type BuildingExpensePdfLine = {
  description: string;
  amount: string;
  date: string;
  category: string;
  supplier: string;
  paidBy: string;
  reference: string | null;
};

export type BuildingExpensePdfGroup = {
  unitLabel: string;
  total: string;
  lines: BuildingExpensePdfLine[];
};

export function BuildingManagementExpensesDocument({
  propertyName,
  groups,
  grandTotal,
  generatedAt,
}: {
  propertyName: string;
  groups: BuildingExpensePdfGroup[];
  grandTotal: string;
  generatedAt: string;
}) {
  const totalLineCount = groups.reduce((sum, g) => sum + g.lines.length, 0);

  return (
    <Document title={`Building Management Expenses — ${propertyName}`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerBar}>
          <View>
            <Text style={styles.titleText}>Building Management Expenses</Text>
            <Text style={styles.subtitleText}>{propertyName}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Generated</Text>
            <Text style={styles.metaText}>{generatedAt}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={styles.statLabel}>Units</Text>
            <Text style={styles.statValue}>{groups.length}</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statLabel}>Expense Lines</Text>
            <Text style={styles.statValue}>{totalLineCount}</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statLabel}>Grand Total</Text>
            <Text style={styles.statValue}>OMR {grandTotal}</Text>
          </View>
        </View>

        {groups.map((group, gi) => (
          <View key={gi} wrap={false}>
            <View style={styles.unitHeaderRow}>
              <View>
                <Text style={styles.unitHeaderLabel}>{group.unitLabel}</Text>
                <Text style={styles.unitHeaderCount}>
                  {group.lines.length} {group.lines.length === 1 ? "expense" : "expenses"}
                </Text>
              </View>
              <Text style={styles.unitHeaderTotal}>OMR {group.total}</Text>
            </View>
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.cellHeader, styles.colDescription]}>
                  Description
                </Text>
                <Text style={[styles.cellHeader, styles.colAmount]}>Amount</Text>
                <Text style={[styles.cellHeader, styles.colDate]}>Date</Text>
                <Text style={[styles.cellHeader, styles.colCategory]}>Category</Text>
                <Text style={[styles.cellHeader, styles.colPaidBy]}>Paid By</Text>
              </View>
              {group.lines.map((line, li) => (
                <View style={li % 2 === 1 ? styles.tableRowStripe : styles.tableRow} key={li}>
                  <View style={styles.colDescription}>
                    <Text style={styles.cell}>{line.description}</Text>
                    <Text style={[styles.sub, { paddingLeft: 6 }]}>
                      {line.supplier}
                      {line.reference ? ` · Ref: ${line.reference}` : ""}
                    </Text>
                  </View>
                  <Text style={[styles.cell, styles.colAmount]}>{line.amount}</Text>
                  <Text style={[styles.cell, styles.colDate]}>{line.date}</Text>
                  <View style={styles.colCategory}>
                    <Text style={[styles.categoryPill, { marginLeft: 6, marginTop: 6 }]}>
                      {line.category}
                    </Text>
                  </View>
                  <Text style={[styles.cell, styles.colPaidBy]}>{line.paidBy}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>Grand Total</Text>
          <Text style={styles.grandTotalValue}>OMR {grandTotal}</Text>
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
