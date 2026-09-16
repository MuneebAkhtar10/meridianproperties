import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Tenant report for one property — a flat table of every active tenancy,
 * styled with this app's own theme (indigo primary, emerald/rose stat-tile
 * language) rather than a plain print-out.
 */

export type TenantReportRow = {
  tenantName: string;
  contact: string;
  area: string;
  agreementNo: string;
  buildingName: string;
  unitNo: string;
  rentPerMonth: string;
  startDate: string;
  endDate: string;
  status: string;
};

const COLORS = {
  primary: "#5048E5",
  primaryDark: "#2F29A3",
  accentBg: "#EEEDFC",
  emerald: "#10B981",
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
    marginBottom: 4,
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
  statRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statAccent: { height: 4 },
  statBody: { padding: 8 },
  statValue: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  statLabel: { fontSize: 8, color: COLORS.mutedForeground, marginTop: 2 },
  row: { flexDirection: "row" },
  headerRow: { backgroundColor: COLORS.primary },
  headerCell: {
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    padding: 5,
  },
  cell: { padding: 5, fontSize: 8 },
  statusBadge: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 1.5,
    paddingHorizontal: 5,
    borderRadius: 3,
    alignSelf: "flex-start",
  },
  colTenant: { width: "16%" },
  colContact: { width: "10%" },
  colArea: { width: "10%" },
  colAgreement: { width: "11%" },
  colBuilding: { width: "13%" },
  colUnit: { width: "8%" },
  colRent: { width: "10%", textAlign: "right" },
  colStart: { width: "9%" },
  colEnd: { width: "9%" },
  colStatus: { width: "8%" },
  note: {
    marginTop: 14,
    fontSize: 7.5,
    color: COLORS.mutedForeground,
    fontFamily: "Helvetica-Oblique",
  },
});

export function TenantReportDocument({
  propertyName,
  rows,
  activeCount,
  totalMonthlyRent,
}: {
  propertyName: string;
  rows: TenantReportRow[];
  activeCount: number;
  totalMonthlyRent: string;
}) {
  return (
    <Document title={`Tenant report - ${propertyName}`}>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View style={styles.headerBar}>
          <Text style={styles.titleText}>TENANT REPORT</Text>
          <Text style={styles.subtitleText}>{propertyName}</Text>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <View style={[styles.statAccent, { backgroundColor: COLORS.primary }]} />
            <View style={styles.statBody}>
              <Text style={styles.statValue}>{activeCount}</Text>
              <Text style={styles.statLabel}>Active tenancies</Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statAccent, { backgroundColor: COLORS.emerald }]} />
            <View style={styles.statBody}>
              <Text style={styles.statValue}>OMR {totalMonthlyRent}</Text>
              <Text style={styles.statLabel}>Scheduled monthly rent</Text>
            </View>
          </View>
        </View>

        <View style={[styles.row, styles.headerRow]} fixed>
          <Text style={[styles.headerCell, styles.colTenant]}>Tenant Name</Text>
          <Text style={[styles.headerCell, styles.colContact]}>Contact</Text>
          <Text style={[styles.headerCell, styles.colArea]}>Area</Text>
          <Text style={[styles.headerCell, styles.colAgreement]}>Agreement No.</Text>
          <Text style={[styles.headerCell, styles.colBuilding]}>Building Name / No</Text>
          <Text style={[styles.headerCell, styles.colUnit]}>Unit No</Text>
          <Text style={[styles.headerCell, styles.colRent]}>Rent Per Month</Text>
          <Text style={[styles.headerCell, styles.colStart]}>Agr. Start Date</Text>
          <Text style={[styles.headerCell, styles.colEnd]}>Agr. End Date</Text>
          <Text style={[styles.headerCell, styles.colStatus]}>Status</Text>
        </View>

        {rows.map((row, index) => (
          <View
            key={index}
            style={[
              styles.row,
              { backgroundColor: index % 2 === 1 ? COLORS.muted : "#FFFFFF" },
            ]}
            wrap={false}
          >
            <Text style={[styles.cell, styles.colTenant]}>{row.tenantName}</Text>
            <Text style={[styles.cell, styles.colContact]}>{row.contact}</Text>
            <Text style={[styles.cell, styles.colArea]}>{row.area}</Text>
            <Text style={[styles.cell, styles.colAgreement]}>{row.agreementNo}</Text>
            <Text style={[styles.cell, styles.colBuilding]}>{row.buildingName}</Text>
            <Text style={[styles.cell, styles.colUnit]}>{row.unitNo}</Text>
            <Text style={[styles.cell, styles.colRent]}>{row.rentPerMonth}</Text>
            <Text style={[styles.cell, styles.colStart]}>{row.startDate}</Text>
            <Text style={[styles.cell, styles.colEnd]}>{row.endDate}</Text>
            <View style={[styles.cell, styles.colStatus]}>
              <Text
                style={[
                  styles.statusBadge,
                  row.status === "Active"
                    ? { backgroundColor: COLORS.accentBg, color: COLORS.primaryDark }
                    : { backgroundColor: COLORS.muted, color: COLORS.mutedForeground },
                ]}
              >
                {row.status}
              </Text>
            </View>
          </View>
        ))}

        <Text
          style={{ position: "absolute", bottom: 14, left: 28, fontSize: 7, color: COLORS.mutedForeground }}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
