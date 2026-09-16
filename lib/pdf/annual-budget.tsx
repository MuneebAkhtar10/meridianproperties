import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Spec #12 "OA Annual Budget" — the estimated budget for a financial
 * period. A reference document only (see AnnualBudget in schema.prisma),
 * so this PDF is just a clean printout of the same income/expenditure
 * tables shown on the budget page, styled like lib/pdf/expense-report.tsx.
 */

const COLORS = {
  primary: "#5048E5",
  primaryDark: "#2F29A3",
  accentBg: "#EEEDFC",
  emerald: "#10B981",
  rose: "#F43F5E",
  muted: "#F4F4F5",
  mutedForeground: "#6F6F7B",
  border: "#E4E4E7",
  foreground: "#1C1C22",
};

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: COLORS.foreground,
  },
  headerBar: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingBottom: 10,
    marginBottom: 14,
  },
  titleText: { fontSize: 15, fontFamily: "Helvetica-Bold", color: COLORS.primary },
  subtitleText: { fontSize: 9, color: COLORS.mutedForeground, marginTop: 2 },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.accentBg,
    padding: 6,
    marginTop: 12,
  },
  sectionHeaderLabel: {
    fontFamily: "Helvetica-Bold",
    color: COLORS.primaryDark,
    fontSize: 10.5,
  },
  sectionHeaderValue: { fontFamily: "Helvetica-Bold", fontSize: 10 },
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
  colDescription: { width: "46%" },
  colFund: { width: "22%" },
  colNum: { width: "16%", textAlign: "right" },
  netRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.muted,
    padding: 8,
    marginTop: 14,
  },
  netLabel: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  netValue: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  generatedAt: { marginTop: 16, fontSize: 7.5, color: COLORS.mutedForeground },
});

export type BudgetIncomeRow = {
  description: string;
  units: number;
  amount: string;
  totalYearly: string;
};

export type BudgetExpenseRow = {
  description: string;
  fundLabel: string;
  ratePerMonth: string;
  ratePerYear: string;
};

export function AnnualBudgetDocument({
  propertyName,
  year,
  incomeLines,
  expenseLines,
  totalIncome,
  totalExpense,
  net,
  netNegative,
  generatedAt,
}: {
  propertyName: string;
  year: number;
  incomeLines: BudgetIncomeRow[];
  expenseLines: BudgetExpenseRow[];
  totalIncome: string;
  totalExpense: string;
  net: string;
  netNegative: boolean;
  generatedAt: string;
}) {
  return (
    <Document title={`Annual Budget ${year} — ${propertyName}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBar}>
          <Text style={styles.titleText}>Annual Budget {year}</Text>
          <Text style={styles.subtitleText}>{propertyName}</Text>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderLabel}>Income</Text>
          <Text style={[styles.sectionHeaderValue, { color: COLORS.emerald }]}>
            {totalIncome}
          </Text>
        </View>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellHeader, styles.colDescription]}>
              Description
            </Text>
            <Text style={[styles.cellHeader, styles.colNum]}>No of Units</Text>
            <Text style={[styles.cellHeader, styles.colNum]}>Amount</Text>
            <Text style={[styles.cellHeader, styles.colNum]}>Total Yearly</Text>
          </View>
          {incomeLines.map((line, idx) => (
            <View style={styles.tableRow} key={idx}>
              <Text style={[styles.cell, styles.colDescription]}>
                {line.description}
              </Text>
              <Text style={[styles.cell, styles.colNum]}>{line.units}</Text>
              <Text style={[styles.cell, styles.colNum]}>{line.amount}</Text>
              <Text style={[styles.cell, styles.colNum, { fontFamily: "Helvetica-Bold" }]}>
                {line.totalYearly}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderLabel}>Expenditure</Text>
          <Text style={[styles.sectionHeaderValue, { color: COLORS.rose }]}>
            {totalExpense}
          </Text>
        </View>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellHeader, styles.colDescription]}>
              Description
            </Text>
            <Text style={[styles.cellHeader, styles.colFund]}>Fund</Text>
            <Text style={[styles.cellHeader, styles.colNum]}>Rate/Month</Text>
            <Text style={[styles.cellHeader, styles.colNum]}>Rate/Year</Text>
          </View>
          {expenseLines.map((line, idx) => (
            <View style={styles.tableRow} key={idx}>
              <Text style={[styles.cell, styles.colDescription]}>
                {line.description}
              </Text>
              <Text style={[styles.cell, styles.colFund]}>{line.fundLabel}</Text>
              <Text style={[styles.cell, styles.colNum]}>{line.ratePerMonth}</Text>
              <Text style={[styles.cell, styles.colNum, { fontFamily: "Helvetica-Bold" }]}>
                {line.ratePerYear}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.netRow}>
          <Text style={styles.netLabel}>Net (Income − Expenditure)</Text>
          <Text
            style={[styles.netValue, { color: netNegative ? COLORS.rose : COLORS.emerald }]}
          >
            {net}
          </Text>
        </View>

        <Text style={styles.generatedAt}>Generated {generatedAt}</Text>
      </Page>
    </Document>
  );
}
