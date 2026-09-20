import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Spec #17 "Unit Ledger" — a printable statement of one unit's complete
 * financial history: one single chronological running balance (every
 * invoice/payment funnels through the same fund, so there's nothing left to
 * split by fund), matching the reference ledger's own columns — Due/Paid
 * Date | Issue Date | Grace | Trans. Number | Description | Period |
 * Amount | Balance, oldest first, ending on a "brought forward" row that
 * carries the same closing balance as the Service Charge Balance above it.
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
  page: {
    padding: 36,
    fontSize: 8.5,
    fontFamily: "Helvetica",
    color: COLORS.foreground,
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingBottom: 12,
    marginBottom: 16,
  },
  titleText: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primary,
  },
  subtitleText: {
    fontSize: 9.5,
    color: COLORS.mutedForeground,
    marginTop: 3,
  },
  metaLabel: {
    fontSize: 7,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "right",
  },
  metaText: { fontSize: 8, color: COLORS.mutedForeground, textAlign: "right" },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  detailBox: {
    width: "20%",
    padding: 8,
    borderRightWidth: 1,
    borderColor: COLORS.border,
  },
  detailLabel: {
    fontSize: 7,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 2 },
  table: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 0,
    marginTop: 16,
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
  tableRowStripe: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.stripe,
  },
  broughtForwardRow: {
    flexDirection: "row",
    backgroundColor: COLORS.accentBg,
  },
  cellHeader: {
    padding: 5,
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
  },
  cell: { padding: 5, fontSize: 8 },
  colDate: { width: "10%" },
  colIssue: { width: "9%" },
  colGrace: { width: "6%", textAlign: "right" },
  colTrans: { width: "10%" },
  colDescription: { width: "16%" },
  colOwner: { width: "14%" },
  colPeriod: { width: "13%" },
  colAmount: { width: "11%", textAlign: "right" },
  colBalance: { width: "11%", textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primary,
    padding: 10,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  totalLabel: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#FFFFFF" },
  totalValue: { fontFamily: "Helvetica-Bold", fontSize: 12, color: "#FFFFFF" },
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

export type UnitLedgerRow = {
  dueOrPaidDate: string;
  issueDate: string;
  grace: string;
  transNumber: string;
  description: string;
  ownerName: string;
  period: string;
  amount: string;
  amountNegative: boolean;
  running: string;
  runningNegative: boolean;
};

export function UnitLedgerStatementDocument({
  associationName,
  buildingNumber,
  unitNo,
  entitlements,
  ownerName,
  totalBalance,
  totalNegative,
  rows,
  generatedAt,
}: {
  associationName: string;
  buildingNumber: string;
  unitNo: string;
  entitlements: string;
  ownerName: string;
  totalBalance: string;
  totalNegative: boolean;
  rows: UnitLedgerRow[];
  generatedAt: string;
}) {
  return (
    <Document title={`Unit Ledger — ${unitNo}`}>
      <Page size="A4" style={styles.page} orientation="landscape" wrap>
        <View style={styles.headerBar}>
          <View>
            <Text style={styles.titleText}>Unit Ledger Statement</Text>
            <Text style={styles.subtitleText}>{associationName}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Generated</Text>
            <Text style={styles.metaText}>{generatedAt}</Text>
          </View>
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
          <View style={[styles.detailBox, { borderRightWidth: 0 }]}>
            <Text style={styles.detailLabel}>Service Charge Balance</Text>
            <Text
              style={[
                styles.detailValue,
                { color: totalNegative ? COLORS.emerald : COLORS.rose },
              ]}
            >
              {totalBalance}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellHeader, styles.colDate]}>Due/Paid Date</Text>
            <Text style={[styles.cellHeader, styles.colIssue]}>Issue Date</Text>
            <Text style={[styles.cellHeader, styles.colGrace]}>Grace</Text>
            <Text style={[styles.cellHeader, styles.colTrans]}>Trans. Number</Text>
            <Text style={[styles.cellHeader, styles.colDescription]}>
              Description
            </Text>
            <Text style={[styles.cellHeader, styles.colOwner]}>Owner</Text>
            <Text style={[styles.cellHeader, styles.colPeriod]}>Period</Text>
            <Text style={[styles.cellHeader, styles.colAmount]}>Amount</Text>
            <Text style={[styles.cellHeader, styles.colBalance]}>Balance</Text>
          </View>
          {rows.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.cell, { width: "100%", color: COLORS.mutedForeground }]}>
                No service charge activity recorded for this unit yet.
              </Text>
            </View>
          ) : (
            rows.map((row, idx) => (
              <View style={idx % 2 === 1 ? styles.tableRowStripe : styles.tableRow} key={idx}>
                <Text style={[styles.cell, styles.colDate]}>{row.dueOrPaidDate}</Text>
                <Text style={[styles.cell, styles.colIssue]}>{row.issueDate}</Text>
                <Text style={[styles.cell, styles.colGrace]}>{row.grace}</Text>
                <Text style={[styles.cell, styles.colTrans]}>{row.transNumber}</Text>
                <Text style={[styles.cell, styles.colDescription]}>
                  {row.description}
                </Text>
                <Text style={[styles.cell, styles.colOwner]}>{row.ownerName}</Text>
                <Text style={[styles.cell, styles.colPeriod]}>{row.period}</Text>
                <Text
                  style={[
                    styles.cell,
                    styles.colAmount,
                    row.amountNegative ? { color: COLORS.emerald } : undefined,
                  ]}
                >
                  {row.amount}
                </Text>
                <Text
                  style={[
                    styles.cell,
                    styles.colBalance,
                    {
                      fontFamily: "Helvetica-Bold",
                      color: row.runningNegative ? COLORS.emerald : COLORS.rose,
                    },
                  ]}
                >
                  {row.running}
                </Text>
              </View>
            ))
          )}
          <View style={styles.broughtForwardRow}>
            <Text style={[styles.cell, { width: "78%", color: COLORS.mutedForeground }]}>
              Brought forward
            </Text>
            <Text style={[styles.cell, styles.colAmount]}>—</Text>
            <Text
              style={[
                styles.cell,
                styles.colBalance,
                {
                  fontFamily: "Helvetica-Bold",
                  color: totalNegative ? COLORS.emerald : COLORS.rose,
                },
              ]}
            >
              {totalBalance}
            </Text>
          </View>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Service Charge Balance</Text>
          <Text style={styles.totalValue}>{totalBalance}</Text>
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
