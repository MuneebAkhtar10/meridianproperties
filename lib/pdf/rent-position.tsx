import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Spec #32 "Rent Position" — printable version of the dashboard at
 * /protected/finances/rent-position, styled like
 * lib/pdf/collection-position.tsx on the OA side of the app.
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
  page: { padding: 28, fontSize: 8.5, fontFamily: "Helvetica", color: COLORS.foreground },
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
  colBuilding: { width: "12%" },
  colUnit: { width: "10%" },
  colTenant: { width: "16%" },
  colMoney: { width: "12%", textAlign: "right" },
  colDate: { width: "11%" },
  colStatus: { width: "11%" },
  generatedAt: { marginTop: 10, fontSize: 7, color: COLORS.mutedForeground },
});

export type RentPositionPdfRow = {
  ownerLabel: string;
  buildingLabel: string;
  unitLabel: string;
  tenantName: string;
  raised: string;
  collected: string;
  outstanding: string;
  nextDueDate: string;
  status: string;
};

export function RentPositionDocument({
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
  rows: RentPositionPdfRow[];
  generatedAt: string;
}) {
  return (
    <Document title="Rent Position">
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View style={styles.headerBar}>
          <Text style={styles.titleText}>Rent Position</Text>
          <Text style={styles.subtitleText}>{scopeLabel}</Text>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: COLORS.primaryDark }]}>
              OMR {totalRaised}
            </Text>
            <Text style={styles.statLabel}>Total Raised</Text>
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
            <Text style={styles.statLabel}>Total Outstanding</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellHeader, styles.colOwner]}>Owner</Text>
            <Text style={[styles.cellHeader, styles.colBuilding]}>Building</Text>
            <Text style={[styles.cellHeader, styles.colUnit]}>Unit</Text>
            <Text style={[styles.cellHeader, styles.colTenant]}>Tenant</Text>
            <Text style={[styles.cellHeader, styles.colMoney]}>Raised</Text>
            <Text style={[styles.cellHeader, styles.colMoney]}>Collected</Text>
            <Text style={[styles.cellHeader, styles.colMoney]}>Outstanding</Text>
            <Text style={[styles.cellHeader, styles.colDate]}>Next Due</Text>
            <Text style={[styles.cellHeader, styles.colStatus]}>Status</Text>
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
                <Text style={[styles.cell, styles.colTenant]}>{row.tenantName}</Text>
                <Text style={[styles.cell, styles.colMoney]}>{row.raised}</Text>
                <Text style={[styles.cell, styles.colMoney]}>{row.collected}</Text>
                <Text style={[styles.cell, styles.colMoney, { fontFamily: "Helvetica-Bold" }]}>
                  {row.outstanding}
                </Text>
                <Text style={[styles.cell, styles.colDate]}>{row.nextDueDate}</Text>
                <Text style={[styles.cell, styles.colStatus]}>{row.status}</Text>
              </View>
            ))
          )}
        </View>

        <Text style={styles.generatedAt}>Generated {generatedAt}</Text>
      </Page>
    </Document>
  );
}
