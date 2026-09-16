import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Spec #17 "Unit Ledger" — a printable statement of one unit's complete
 * financial history, grouped per fund (see UnitFundBalance in
 * schema.prisma). Styled with this app's own indigo theme, matching
 * lib/pdf/expense-report.tsx, rather than the plain reference-invoice look
 * of lib/pdf/service-charge-invoice.tsx — this is an internal/owner
 * statement, not the formal invoice sent for payment.
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
    marginBottom: 12,
  },
  titleText: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primary,
  },
  subtitleText: {
    fontSize: 9,
    color: COLORS.mutedForeground,
    marginTop: 2,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  detailBox: {
    width: "23%",
    backgroundColor: COLORS.muted,
    borderRadius: 4,
    padding: 6,
  },
  detailLabel: {
    fontSize: 7,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
  },
  detailValue: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    marginTop: 2,
  },
  fundHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.accentBg,
    padding: 6,
    marginTop: 10,
  },
  fundHeaderLabel: {
    fontFamily: "Helvetica-Bold",
    color: COLORS.primaryDark,
    fontSize: 10,
  },
  fundHeaderBalance: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  table: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 0,
  },
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
  colDate: { width: "14%" },
  colDescription: { width: "40%" },
  colDebit: { width: "15%", textAlign: "right" },
  colCredit: { width: "15%", textAlign: "right" },
  colRunning: { width: "16%", textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: COLORS.border,
    backgroundColor: COLORS.muted,
    padding: 8,
    marginBottom: 4,
  },
  totalLabel: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  totalValue: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  generatedAt: {
    marginTop: 16,
    fontSize: 7.5,
    color: COLORS.mutedForeground,
  },
});

export type UnitLedgerRow = {
  date: string;
  description: string;
  debit: string | null;
  credit: string | null;
  running: string;
  runningNegative: boolean;
};

export type UnitLedgerFundGroup = {
  label: string;
  closingBalance: string;
  closingNegative: boolean;
  rows: UnitLedgerRow[];
};

export function UnitLedgerStatementDocument({
  associationName,
  buildingNumber,
  unitNo,
  entitlements,
  ownerName,
  totalBalance,
  totalNegative,
  fundGroups,
  generatedAt,
}: {
  associationName: string;
  buildingNumber: string;
  unitNo: string;
  entitlements: string;
  ownerName: string;
  totalBalance: string;
  totalNegative: boolean;
  fundGroups: UnitLedgerFundGroup[];
  generatedAt: string;
}) {
  return (
    <Document title={`Unit Ledger — ${unitNo}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBar}>
          <Text style={styles.titleText}>Unit Ledger Statement</Text>
          <Text style={styles.subtitleText}>{associationName}</Text>
        </View>

        <View style={styles.detailGrid}>
          <View style={styles.detailBox}>
            <Text style={styles.detailLabel}>Owner</Text>
            <Text style={styles.detailValue}>{ownerName}</Text>
          </View>
          <View style={styles.detailBox}>
            <Text style={styles.detailLabel}>Building</Text>
            <Text style={styles.detailValue}>{buildingNumber}</Text>
          </View>
          <View style={styles.detailBox}>
            <Text style={styles.detailLabel}>Unit No.</Text>
            <Text style={styles.detailValue}>{unitNo}</Text>
          </View>
          <View style={styles.detailBox}>
            <Text style={styles.detailLabel}>Unit Entitlement</Text>
            <Text style={styles.detailValue}>{entitlements}</Text>
          </View>
        </View>

        {fundGroups.map((group) => (
          <View key={group.label} wrap={false}>
            <View style={styles.fundHeaderRow}>
              <Text style={styles.fundHeaderLabel}>{group.label}</Text>
              <Text
                style={[
                  styles.fundHeaderBalance,
                  { color: group.closingNegative ? COLORS.emerald : COLORS.rose },
                ]}
              >
                {group.closingBalance}
              </Text>
            </View>
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.cellHeader, styles.colDate]}>Date</Text>
                <Text style={[styles.cellHeader, styles.colDescription]}>
                  Description
                </Text>
                <Text style={[styles.cellHeader, styles.colDebit]}>Debit</Text>
                <Text style={[styles.cellHeader, styles.colCredit]}>Credit</Text>
                <Text style={[styles.cellHeader, styles.colRunning]}>
                  Running balance
                </Text>
              </View>
              {group.rows.map((row, idx) => (
                <View style={styles.tableRow} key={idx}>
                  <Text style={[styles.cell, styles.colDate]}>{row.date}</Text>
                  <Text style={[styles.cell, styles.colDescription]}>
                    {row.description}
                  </Text>
                  <Text style={[styles.cell, styles.colDebit]}>
                    {row.debit ?? "—"}
                  </Text>
                  <Text style={[styles.cell, styles.colCredit]}>
                    {row.credit ?? "—"}
                  </Text>
                  <Text
                    style={[
                      styles.cell,
                      styles.colRunning,
                      {
                        color: row.runningNegative ? COLORS.emerald : COLORS.rose,
                        fontFamily: "Helvetica-Bold",
                      },
                    ]}
                  >
                    {row.running}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={[styles.totalRow, { marginTop: 12 }]}>
          <Text style={styles.totalLabel}>Total balance (all funds)</Text>
          <Text
            style={[
              styles.totalValue,
              { color: totalNegative ? COLORS.emerald : COLORS.rose },
            ]}
          >
            {totalBalance}
          </Text>
        </View>

        <Text style={styles.generatedAt}>Generated {generatedAt}</Text>
      </Page>
    </Document>
  );
}
