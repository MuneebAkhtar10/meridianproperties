import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * The flat "owner association" line-item sheet the client sent as a
 * reference — an income table, then an ungrouped expenditure list under
 * Rate/Month + Rate/Year — restyled with this app's own theme (indigo
 * primary, the emerald/rose stat-tile language used across the Expenses
 * page) instead of the source spreadsheet's grey/Excel-blue colors.
 */

export type ExpenseReportRow = {
  description: string;
  ratePerMonth: string;
  ratePerYear: string;
};

// Matches app/globals.css's CSS variables (--primary, --accent, --muted, …)
// converted to hex, plus the emerald/rose status colors used for money
// in/out elsewhere in the app.
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
    marginBottom: 4,
  },
  titleText: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primary,
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
  statAccent: {
    height: 4,
  },
  statBody: {
    padding: 8,
  },
  statValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
  },
  statLabel: {
    fontSize: 8,
    color: COLORS.mutedForeground,
    marginTop: 2,
  },

  row: {
    flexDirection: "row",
  },
  headerRow: {
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  headerCell: {
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    padding: 6,
  },
  cell: {
    padding: 6,
  },
  totalRow: {
    flexDirection: "row",
    marginTop: 2,
    padding: 8,
    borderRadius: 5,
  },
  totalCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: "#FFFFFF",
  },
  categoryPillRow: {
    flexDirection: "row",
    marginTop: 4,
    marginBottom: 2,
  },
  categoryPill: {
    backgroundColor: COLORS.muted,
    color: COLORS.foreground,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  spacer: {
    height: 12,
  },
  // Income table columns
  incDescription: { width: "46%" },
  incUnits: { width: "18%", textAlign: "center" },
  incAmount: { width: "18%", textAlign: "right" },
  incTotal: { width: "18%", textAlign: "right" },
  // Expenditure table columns
  expDescription: { width: "64%" },
  expMonth: { width: "18%", textAlign: "right" },
  expYear: { width: "18%", textAlign: "right" },
  note: {
    marginTop: 14,
    fontSize: 7.5,
    color: COLORS.mutedForeground,
    fontFamily: "Helvetica-Oblique",
  },
});

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statAccent, { backgroundColor: accent }]} />
      <View style={styles.statBody}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

export function ExpenseReportDocument({
  titleText,
  income,
  expenditureRows,
  totalRatePerMonth,
  totalRatePerYear,
}: {
  titleText: string;
  /** Omitted entirely when the report spans more than one property. */
  income?: {
    residentialUnitCount: number;
    amount: string | null;
    totalYearly: string | null;
  };
  expenditureRows: ExpenseReportRow[];
  totalRatePerMonth: string;
  totalRatePerYear: string;
}) {
  return (
    <Document title={titleText}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerBar}>
          <Text style={styles.titleText}>{titleText}</Text>
        </View>

        {income && (
          <View style={styles.statRow}>
            <StatCard
              label="Total Income"
              value={income.totalYearly ? `OMR ${income.totalYearly}` : "-"}
              accent={COLORS.emerald}
            />
            <StatCard
              label="Total Expenditure"
              value={`OMR ${totalRatePerYear}`}
              accent={COLORS.rose}
            />
          </View>
        )}

        {income && (
          <>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.headerCell, styles.incDescription]}>Description</Text>
              <Text style={[styles.headerCell, styles.incUnits]}>No of Units</Text>
              <Text style={[styles.headerCell, styles.incAmount]}>Amount</Text>
              <Text style={[styles.headerCell, styles.incTotal]}>Total Yearly</Text>
            </View>
            <View style={[styles.row, { backgroundColor: COLORS.muted }]}>
              <Text style={[styles.cell, styles.incDescription]}>
                Residential Management service fees
              </Text>
              <Text style={[styles.cell, styles.incUnits]}>
                {income.residentialUnitCount}
              </Text>
              <Text style={[styles.cell, styles.incAmount]}>{income.amount ?? "-"}</Text>
              <Text style={[styles.cell, styles.incTotal]}>
                {income.totalYearly ?? "-"}
              </Text>
            </View>
            <View style={[styles.totalRow, { backgroundColor: COLORS.emerald }]}>
              <Text style={[styles.totalCell, styles.incDescription]}>Total Income</Text>
              <Text style={[styles.totalCell, styles.incUnits]} />
              <Text style={[styles.totalCell, styles.incAmount]} />
              <Text style={[styles.totalCell, styles.incTotal]}>
                {income.totalYearly ? `OMR ${income.totalYearly}` : "-"}
              </Text>
            </View>
            <View style={styles.spacer} />
          </>
        )}

        <View style={styles.row} fixed>
          <Text style={[styles.headerCell, { color: COLORS.primaryDark, backgroundColor: COLORS.accentBg }, styles.expDescription]}>
            Description
          </Text>
          <Text style={[styles.headerCell, { color: COLORS.primaryDark, backgroundColor: COLORS.accentBg }, styles.expMonth]}>
            Rate/Month
          </Text>
          <Text style={[styles.headerCell, { color: COLORS.primaryDark, backgroundColor: COLORS.accentBg }, styles.expYear]}>
            Rate/Year
          </Text>
        </View>
        <View style={styles.categoryPillRow}>
          <Text style={styles.categoryPill}>
            {income ? "Less Expenditure" : "Expenditure"}
          </Text>
        </View>

        {expenditureRows.map((row, index) => (
          <View
            key={index}
            style={[
              styles.row,
              { backgroundColor: index % 2 === 1 ? COLORS.muted : "#FFFFFF" },
            ]}
            wrap={false}
          >
            <Text style={[styles.cell, styles.expDescription]}>{row.description}</Text>
            <Text style={[styles.cell, styles.expMonth]}>{row.ratePerMonth}</Text>
            <Text style={[styles.cell, styles.expYear]}>{row.ratePerYear}</Text>
          </View>
        ))}

        <View style={[styles.totalRow, { marginTop: 6, backgroundColor: COLORS.rose }]}>
          <Text style={[styles.totalCell, styles.expDescription]}>Total Expenditure</Text>
          <Text style={[styles.totalCell, styles.expMonth]}>{totalRatePerMonth}</Text>
          <Text style={[styles.totalCell, styles.expYear]}>{totalRatePerYear}</Text>
        </View>

        <Text style={styles.note}>
          Rate/Month is each line&apos;s yearly amount divided by 12 for display —
          expenses are logged as a single yearly figure, not a separate billing
          frequency.{income ? ' Income shows "-" where no per-unit service charge is configured yet.' : ""}
        </Text>

        <Text
          style={{ position: "absolute", bottom: 16, left: 32, fontSize: 7, color: COLORS.mutedForeground }}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
