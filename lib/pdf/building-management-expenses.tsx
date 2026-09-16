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
  unitHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: COLORS.accentBg,
    padding: 6,
    marginTop: 10,
  },
  unitHeaderLabel: { fontFamily: "Helvetica-Bold", color: COLORS.primaryDark, fontSize: 10 },
  unitHeaderTotal: { fontFamily: "Helvetica-Bold", fontSize: 10, color: COLORS.rose },
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
  cellHeader: {
    padding: 5,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
  },
  cell: { padding: 5, fontSize: 8.5 },
  colDescription: { width: "40%" },
  colAmount: { width: "15%", textAlign: "right" },
  colDate: { width: "15%" },
  colCategory: { width: "15%" },
  colPaidBy: { width: "15%" },
  sub: { fontSize: 7, color: COLORS.mutedForeground, marginTop: 1 },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    padding: 8,
    backgroundColor: COLORS.rose,
    borderRadius: 5,
  },
  grandTotalLabel: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#FFFFFF" },
  grandTotalValue: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#FFFFFF" },
  generatedAt: { marginTop: 12, fontSize: 7.5, color: COLORS.mutedForeground },
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
  return (
    <Document title={`Building Management Expenses — ${propertyName}`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerBar}>
          <Text style={styles.titleText}>Building Management Expenses</Text>
          <Text style={styles.subtitleText}>{propertyName}</Text>
        </View>

        {groups.map((group, gi) => (
          <View key={gi} wrap={false}>
            <View style={styles.unitHeaderRow}>
              <Text style={styles.unitHeaderLabel}>{group.unitLabel}</Text>
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
                <View style={styles.tableRow} key={li}>
                  <View style={styles.colDescription}>
                    <Text style={styles.cell}>{line.description}</Text>
                    <Text style={[styles.sub, { paddingLeft: 5 }]}>
                      {line.supplier}
                      {line.reference ? ` · Ref: ${line.reference}` : ""}
                    </Text>
                  </View>
                  <Text style={[styles.cell, styles.colAmount]}>{line.amount}</Text>
                  <Text style={[styles.cell, styles.colDate]}>{line.date}</Text>
                  <Text style={[styles.cell, styles.colCategory]}>{line.category}</Text>
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

        <Text style={styles.generatedAt}>Generated {generatedAt}</Text>
      </Page>
    </Document>
  );
}
