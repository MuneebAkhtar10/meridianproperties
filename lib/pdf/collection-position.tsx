import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Spec #18 "OA Collection Position" — a printable version of the dashboard
 * at /protected/service-charge-ledger/collection-position: the same
 * summary totals and the same per-unit table, styled like this app's other
 * financial PDFs (lib/pdf/cash-flow-statement.tsx).
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
    padding: 28,
    fontSize: 8.5,
    fontFamily: "Helvetica",
    color: COLORS.foreground,
  },
  headerBar: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingBottom: 10,
    marginBottom: 12,
  },
  titleText: { fontSize: 15, fontFamily: "Helvetica-Bold", color: COLORS.primary },
  subtitleText: { fontSize: 9, color: COLORS.mutedForeground, marginTop: 2 },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 7,
  },
  statValue: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  statLabel: { fontSize: 7, color: COLORS.mutedForeground, marginTop: 2 },
  table: { borderWidth: 1, borderColor: COLORS.border },
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
    padding: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
  },
  cell: { padding: 4, fontSize: 7.5 },
  colOwner: { width: "16%" },
  colBuilding: { width: "10%" },
  colUnit: { width: "10%" },
  colMoney: { width: "11%", textAlign: "right" },
  colDate: { width: "11%" },
  colReminder: { width: "11%" },
  colArrangement: { width: "10%" },
  generatedAt: { marginTop: 10, fontSize: 7, color: COLORS.mutedForeground },
});

export type CollectionPositionRow = {
  ownerLabel: string;
  buildingLabel: string;
  unitLabel: string;
  raised: string;
  paid: string;
  outstanding: string;
  dueDate: string;
  daysOverdue: string;
  lastReminder: string;
  arrangement: string;
};

export function CollectionPositionDocument({
  scopeLabel,
  totalRaised,
  totalCollected,
  totalOutstanding,
  rows,
  generatedAt,
}: {
  scopeLabel: string;
  totalRaised: string;
  totalCollected: string;
  totalOutstanding: string;
  rows: CollectionPositionRow[];
  generatedAt: string;
}) {
  return (
    <Document title="Collection Position">
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View style={styles.headerBar}>
          <Text style={styles.titleText}>OA Collection Position</Text>
          <Text style={styles.subtitleText}>{scopeLabel}</Text>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: COLORS.primaryDark }]}>
              OMR {totalRaised}
            </Text>
            <Text style={styles.statLabel}>Total Service Charges Raised</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: COLORS.emerald }]}>
              OMR {totalCollected}
            </Text>
            <Text style={styles.statLabel}>Collected</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: COLORS.rose }]}>
              OMR {totalOutstanding}
            </Text>
            <Text style={styles.statLabel}>Outstanding</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellHeader, styles.colOwner]}>Owner</Text>
            <Text style={[styles.cellHeader, styles.colBuilding]}>Building</Text>
            <Text style={[styles.cellHeader, styles.colUnit]}>Unit</Text>
            <Text style={[styles.cellHeader, styles.colMoney]}>Amount Due</Text>
            <Text style={[styles.cellHeader, styles.colMoney]}>Amount Paid</Text>
            <Text style={[styles.cellHeader, styles.colMoney]}>Outstanding</Text>
            <Text style={[styles.cellHeader, styles.colDate]}>Due Date</Text>
            <Text style={[styles.cellHeader, styles.colUnit]}>Days Overdue</Text>
            <Text style={[styles.cellHeader, styles.colReminder]}>Last Reminder</Text>
            <Text style={[styles.cellHeader, styles.colArrangement]}>
              Payment Arrangement
            </Text>
          </View>
          {rows.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.cell, { width: "100%", textAlign: "center" }]}>
                No units match this filter.
              </Text>
            </View>
          ) : (
            rows.map((row, i) => (
              <View style={styles.tableRow} key={i}>
                <Text style={[styles.cell, styles.colOwner]}>{row.ownerLabel}</Text>
                <Text style={[styles.cell, styles.colBuilding]}>{row.buildingLabel}</Text>
                <Text style={[styles.cell, styles.colUnit]}>{row.unitLabel}</Text>
                <Text style={[styles.cell, styles.colMoney]}>{row.raised}</Text>
                <Text style={[styles.cell, styles.colMoney]}>{row.paid}</Text>
                <Text style={[styles.cell, styles.colMoney, { fontFamily: "Helvetica-Bold" }]}>
                  {row.outstanding}
                </Text>
                <Text style={[styles.cell, styles.colDate]}>{row.dueDate}</Text>
                <Text style={[styles.cell, styles.colUnit]}>{row.daysOverdue}</Text>
                <Text style={[styles.cell, styles.colReminder]}>{row.lastReminder}</Text>
                <Text style={[styles.cell, styles.colArrangement]}>{row.arrangement}</Text>
              </View>
            ))
          )}
        </View>

        <Text style={styles.generatedAt}>Generated {generatedAt}</Text>
      </Page>
    </Document>
  );
}
