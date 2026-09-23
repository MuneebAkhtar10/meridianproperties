import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * A real cash flow statement — REVENUE, then EXPENDITURE broken down by
 * category with subtotals, then a SUMMARY — styled with this app's own
 * theme (indigo primary, the same category-badge and stat-tile language
 * used across the Expenses page) instead of a plain financial-statement
 * printout.
 */

export type CashFlowCategoryGroup = {
  categoryLabel: string;
  lines: { label: string; amount: string }[];
  total: string;
};

// Matches app/globals.css's CSS variables (--primary, --accent, --muted, …)
// converted to hex, plus the status colors used for the Revenue/Expenditure
// stat tiles elsewhere in the app (emerald for money in, rose for money out).
const COLORS = {
  primary: "#5048E5",
  primaryDark: "#2F29A3",
  accentBg: "#EEEDFC",
  emerald: "#10B981",
  emeraldBg: "#ECFDF5",
  rose: "#F43F5E",
  roseBg: "#FFF1F2",
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingBottom: 10,
    marginBottom: 4,
  },
  propertyName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: COLORS.foreground,
  },
  propertyAddress: {
    fontSize: 8.5,
    color: COLORS.mutedForeground,
    marginTop: 2,
  },
  reportTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primary,
    textAlign: "right",
  },
  period: {
    fontSize: 8,
    color: COLORS.mutedForeground,
    textAlign: "right",
    marginTop: 1,
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

  sectionPillRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 6,
  },
  sectionPill: {
    backgroundColor: COLORS.accentBg,
    color: COLORS.primaryDark,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  sectionPeriod: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Oblique",
    color: COLORS.mutedForeground,
  },

  categoryPillRow: {
    flexDirection: "row",
    marginTop: 8,
    marginBottom: 2,
  },
  categoryPill: {
    backgroundColor: COLORS.muted,
    color: COLORS.foreground,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    paddingVertical: 2.5,
    paddingHorizontal: 7,
    borderRadius: 3,
  },

  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 10,
    paddingVertical: 2,
  },
  itemRowBand: {
    backgroundColor: "#FAFAFB",
  },
  itemLabel: { width: "80%", fontSize: 8.5 },
  itemAmount: { width: "20%", textAlign: "right", fontSize: 8.5 },

  subtotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 10,
    paddingTop: 2,
    paddingBottom: 3,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
  },
  subtotalLabel: { width: "80%", fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  subtotalAmount: {
    width: "20%",
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
  },

  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    padding: 8,
    borderRadius: 5,
  },
  grandTotalLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: "#FFFFFF",
  },
  grandTotalAmount: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: "#FFFFFF",
  },

  note: {
    marginTop: 16,
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

export function CashFlowStatementDocument({
  propertyName,
  propertyAddress,
  periodLabel,
  openingBalance,
  openingIsDeficit,
  revenueLines,
  revenueTotal,
  expenditureGroups,
  expenditureTotal,
  closingBalance,
  closingIsDeficit,
  closingLabel,
}: {
  propertyName: string;
  propertyAddress: string;
  periodLabel: string;
  openingBalance: string;
  openingIsDeficit: boolean;
  revenueLines: { label: string; amount: string }[];
  revenueTotal: string;
  expenditureGroups: CashFlowCategoryGroup[];
  expenditureTotal: string;
  closingBalance: string;
  closingIsDeficit: boolean;
  closingLabel: string;
}) {
  return (
    <Document title={`Cash flow statement - ${propertyName}`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerBar}>
          <View>
            <Text style={styles.propertyName}>{propertyName}</Text>
            <Text style={styles.propertyAddress}>{propertyAddress}</Text>
          </View>
          <View>
            <Text style={styles.reportTitle}>DETAILED CASH FLOW STATEMENT</Text>
            <Text style={styles.period}>{periodLabel}</Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <StatCard
            label="Opening Balance"
            value={`OMR ${openingBalance}`}
            accent={openingIsDeficit ? COLORS.rose : COLORS.emerald}
          />
          <StatCard
            label="Total Revenue"
            value={`OMR ${revenueTotal}`}
            accent={COLORS.emerald}
          />
          <StatCard
            label="Total Expenditure"
            value={`OMR ${expenditureTotal}`}
            accent={COLORS.rose}
          />
          <StatCard
            label="Closing Balance"
            value={`OMR ${closingBalance}`}
            accent={closingIsDeficit ? COLORS.rose : COLORS.emerald}
          />
        </View>

        <View style={styles.sectionPillRow}>
          <Text style={styles.sectionPill}>REVENUE</Text>
          <Text style={styles.sectionPeriod}>{periodLabel}</Text>
        </View>
        <View style={styles.categoryPillRow}>
          <Text style={styles.categoryPill}>Service Charge Revenue</Text>
        </View>
        {revenueLines.length === 0 ? (
          <View style={styles.itemRow}>
            <Text style={styles.itemLabel}>No service charge configured yet</Text>
            <Text style={styles.itemAmount}>-</Text>
          </View>
        ) : (
          revenueLines.map((line, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemLabel}>{line.label}</Text>
              <Text style={styles.itemAmount}>{line.amount}</Text>
            </View>
          ))
        )}
        <View style={styles.subtotalRow}>
          <Text style={styles.subtotalLabel}>Total Service Charge Revenue</Text>
          <Text style={styles.subtotalAmount}>{revenueTotal}</Text>
        </View>
        <View
          style={[styles.grandTotalRow, { backgroundColor: COLORS.emerald }]}
        >
          <Text style={styles.grandTotalLabel}>Total Revenue</Text>
          <Text style={styles.grandTotalAmount}>OMR {revenueTotal}</Text>
        </View>

        <View style={styles.sectionPillRow}>
          <Text style={styles.sectionPill}>EXPENDITURE</Text>
          <Text style={styles.sectionPeriod}>{periodLabel}</Text>
        </View>
        {expenditureGroups.map((group, gi) => (
          <View key={gi} wrap={false}>
            <View style={styles.categoryPillRow}>
              <Text style={styles.categoryPill}>{group.categoryLabel}</Text>
            </View>
            {group.lines.map((line, i) => (
              <View
                key={i}
                style={[styles.itemRow, i % 2 === 1 ? styles.itemRowBand : undefined]}
              >
                <Text style={styles.itemLabel}>{line.label}</Text>
                <Text style={styles.itemAmount}>{line.amount}</Text>
              </View>
            ))}
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>
                Total {group.categoryLabel}
              </Text>
              <Text style={styles.subtotalAmount}>{group.total}</Text>
            </View>
          </View>
        ))}
        <View style={[styles.grandTotalRow, { backgroundColor: COLORS.rose }]}>
          <Text style={styles.grandTotalLabel}>Total Expenditure</Text>
          <Text style={styles.grandTotalAmount}>OMR {expenditureTotal}</Text>
        </View>

        <View style={styles.sectionPillRow}>
          <Text style={styles.sectionPill}>SUMMARY</Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 4 }}>
          <View style={[styles.itemRow, { paddingLeft: 8, paddingVertical: 4 }]}>
            <Text style={[styles.itemLabel, { width: "70%" }]}>
              Opening Balance
            </Text>
            <Text style={[styles.itemAmount, { width: "30%" }]}>
              OMR {openingBalance}
            </Text>
          </View>
          <View
            style={[
              styles.itemRow,
              styles.itemRowBand,
              { paddingLeft: 8, paddingVertical: 4 },
            ]}
          >
            <Text style={[styles.itemLabel, { width: "70%" }]}>
              Total Revenue during period
            </Text>
            <Text style={[styles.itemAmount, { width: "30%" }]}>
              OMR {revenueTotal}
            </Text>
          </View>
          <View style={[styles.itemRow, { paddingLeft: 8, paddingVertical: 4 }]}>
            <Text style={[styles.itemLabel, { width: "70%" }]}>
              Total Expenditure during period
            </Text>
            <Text style={[styles.itemAmount, { width: "30%" }]}>
              OMR {expenditureTotal}
            </Text>
          </View>
          <View
            style={[
              styles.subtotalRow,
              { paddingLeft: 8, paddingVertical: 5, borderTopWidth: 1 },
            ]}
          >
            <Text style={[styles.subtotalLabel, { width: "70%" }]}>
              Closing Balance
            </Text>
            <Text style={[styles.subtotalAmount, { width: "30%" }]}>
              OMR {closingBalance}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.grandTotalRow,
            {
              marginTop: 14,
              backgroundColor: closingIsDeficit ? COLORS.rose : COLORS.emerald,
            },
          ]}
        >
          <Text style={styles.grandTotalLabel}>{closingLabel}</Text>
          <Text style={styles.grandTotalAmount}>OMR {closingBalance}</Text>
        </View>

        <Text
          style={{
            position: "absolute",
            bottom: 16,
            left: 32,
            fontSize: 7,
            color: COLORS.mutedForeground,
          }}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
