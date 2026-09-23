import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Property Summary Report — Darsait-style two-page statement:
 * page 1 rental / expenses / settlement, page 2 unit-level detail.
 */

const COLORS = {
  primary: "#4F46E5",
  primaryDark: "#312E81",
  accentBg: "#EEF2FF",
  emerald: "#059669",
  emeraldSoft: "#ECFDF5",
  rose: "#E11D48",
  roseSoft: "#FFF1F2",
  amber: "#D97706",
  sky: "#0284C7",
  muted: "#F8FAFC",
  mutedForeground: "#64748B",
  border: "#E2E8F0",
  foreground: "#0F172A",
  stripe: "#FAFAFA",
};

const styles = StyleSheet.create({
  page: {
    padding: 28,
    paddingBottom: 36,
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
  titleText: { fontSize: 15, fontFamily: "Helvetica-Bold", color: COLORS.primaryDark },
  subtitleText: { fontSize: 9, color: COLORS.mutedForeground, marginTop: 3 },
  kpis: { flexDirection: "row", gap: 8, marginBottom: 12 },
  kpi: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 8,
    backgroundColor: COLORS.muted,
  },
  kpiLabel: {
    fontSize: 7,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  kpiValue: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 3 },
  sectionHeader: {
    backgroundColor: COLORS.accentBg,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 12,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  sectionHeaderText: {
    fontFamily: "Helvetica-Bold",
    color: COLORS.primaryDark,
    fontSize: 9.5,
  },
  table: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
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
  totalRow: { flexDirection: "row", backgroundColor: COLORS.accentBg },
  cellHeader: {
    paddingVertical: 5,
    paddingHorizontal: 7,
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
  },
  cell: { paddingVertical: 5, paddingHorizontal: 7, fontSize: 8.5 },
  cellBold: {
    paddingVertical: 6,
    paddingHorizontal: 7,
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primaryDark,
  },
  cellRight: { textAlign: "right" },
  emptyCell: {
    padding: 8,
    fontSize: 8,
    color: COLORS.mutedForeground,
    fontFamily: "Helvetica-Oblique",
  },
  colDesc: { width: "58%" },
  colUnits: { width: "18%" },
  colAmount: { width: "24%" },
  colUnit: { width: "28%" },
  colDetailDesc: { width: "48%" },
  colDetailAmt: { width: "24%" },
  twoCol: { flexDirection: "row", gap: 10, marginTop: 12 },
  col: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  barTrack: {
    height: 10,
    backgroundColor: "#E0E7FF",
    borderRadius: 5,
    flexDirection: "row",
    overflow: "hidden",
    marginTop: 6,
  },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 7.5, color: COLORS.mutedForeground },
  unitChip: {
    fontSize: 8,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    marginRight: 4,
    marginBottom: 4,
  },
  unitWrap: { flexDirection: "row", flexWrap: "wrap", padding: 7 },
  finalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    padding: 10,
    borderRadius: 7,
  },
  finalLabel: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "#FFFFFF" },
  finalValue: { fontFamily: "Helvetica-Bold", fontSize: 13, color: "#FFFFFF" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 5,
  },
  footerText: { fontSize: 7, color: COLORS.mutedForeground },
  chartCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 10,
    paddingBottom: 8,
  },
  chartTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 8,
    color: COLORS.foreground,
  },
  chartBody: { flexDirection: "row", height: 168 },
  chartAxis: {
    width: 36,
    height: 150,
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingRight: 4,
  },
  chartAxisLabel: { fontSize: 6.5, color: COLORS.mutedForeground },
  chartPlot: {
    flexGrow: 1,
    height: 150,
    borderLeftWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: "#94A3B8",
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 4,
  },
  chartCol: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 2,
  },
  chartValue: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
    textAlign: "center",
  },
  chartBar: {
    width: "72%",
    maxWidth: 42,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  chartLabel: {
    fontSize: 6,
    color: COLORS.mutedForeground,
    textAlign: "center",
    marginTop: 4,
    height: 22,
  },
});

export type ReportPdfChartBar = { label: string; amount: number; color: string };

function formatChartAmount(value: number) {
  if (value === 0) return "0";
  if (Math.abs(value - Math.round(value)) < 0.001) return String(Math.round(value));
  return value.toFixed(1);
}

function DataReportChart({ series }: { series: ReportPdfChartBar[] }) {
  const maxVal = Math.max(...series.map((bar) => bar.amount), 0);
  const yMax = Math.max(500, Math.ceil(maxVal / 500) * 500);
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((yMax * (tickCount - i)) / tickCount),
  );
  const plotH = 118;

  return (
    <View style={styles.chartCard} wrap={false}>
      <Text style={styles.chartTitle}>Data Report</Text>
      <View style={styles.chartBody}>
        <View style={styles.chartAxis}>
          {ticks.map((tick) => (
            <Text key={tick} style={styles.chartAxisLabel}>
              {tick}
            </Text>
          ))}
        </View>
        <View style={styles.chartPlot}>
          {series.map((bar) => {
            const height = yMax > 0 ? Math.max(bar.amount > 0 ? 3 : 0, (bar.amount / yMax) * plotH) : 0;
            return (
              <View key={bar.label} style={styles.chartCol}>
                <Text style={[styles.chartValue, { color: bar.color }]}>
                  {formatChartAmount(bar.amount)}
                </Text>
                <View
                  style={[
                    styles.chartBar,
                    { height, backgroundColor: bar.color },
                  ]}
                />
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: "row", marginLeft: 36, marginTop: 2 }}>
        {series.map((bar) => (
          <Text key={bar.label} style={[styles.chartLabel, { flexGrow: 1, flexBasis: 0 }]}>
            {bar.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export type ReportPdfLine = { description: string; unitCount: number; amount: string };

export type ReportPdfDetail = { unitLabel: string; description: string; amount: string };

export type ReportPdfRentDetail = {
  unitLabel: string;
  tenantName: string;
  month: string;
  paidAt: string;
  amount: string;
};

function HeaderRow({
  columns,
}: {
  columns: { label: string; width: string; right?: boolean }[];
}) {
  return (
    <View style={styles.tableHeaderRow}>
      {columns.map((col) => (
        <Text
          key={col.label}
          style={[
            styles.cellHeader,
            { width: col.width },
            col.right ? styles.cellRight : {},
          ]}
        >
          {col.label}
        </Text>
      ))}
    </View>
  );
}

function SummaryTable({
  rows,
  totalRow,
}: {
  rows: ReportPdfLine[];
  totalRow: ReportPdfLine;
}) {
  return (
    <View style={styles.table}>
      <HeaderRow
        columns={[
          { label: "Description", width: "58%" },
          { label: "No of Units", width: "18%", right: true },
          { label: "Amount", width: "24%", right: true },
        ]}
      />
      {rows.map((row, i) => (
        <View style={i % 2 === 1 ? styles.tableRowStripe : styles.tableRow} key={i}>
          <Text style={[styles.cell, styles.colDesc]}>{row.description}</Text>
          <Text style={[styles.cell, styles.colUnits, styles.cellRight]}>
            {row.unitCount}
          </Text>
          <Text style={[styles.cell, styles.colAmount, styles.cellRight]}>
            {row.amount}
          </Text>
        </View>
      ))}
      <View style={styles.totalRow}>
        <Text style={[styles.cellBold, styles.colDesc]}>{totalRow.description}</Text>
        <Text style={[styles.cellBold, styles.colUnits, styles.cellRight]}>
          {totalRow.unitCount}
        </Text>
        <Text style={[styles.cellBold, styles.colAmount, styles.cellRight]}>
          {totalRow.amount}
        </Text>
      </View>
    </View>
  );
}

function DetailTable({
  rows,
  empty,
  total,
}: {
  rows: ReportPdfDetail[];
  empty: string;
  total: string;
}) {
  return (
    <View style={styles.table}>
      <HeaderRow
        columns={[
          { label: "Unit", width: "28%" },
          { label: "Description", width: "48%" },
          { label: "Amount", width: "24%", right: true },
        ]}
      />
      {rows.length === 0 ? (
        <View style={styles.tableRow}>
          <Text style={styles.emptyCell}>{empty}</Text>
        </View>
      ) : (
        rows.map((row, i) => (
          <View style={i % 2 === 1 ? styles.tableRowStripe : styles.tableRow} key={i}>
            <Text style={[styles.cell, styles.colUnit]}>{row.unitLabel}</Text>
            <Text style={[styles.cell, styles.colDetailDesc]}>{row.description}</Text>
            <Text style={[styles.cell, styles.colDetailAmt, styles.cellRight]}>
              {row.amount}
            </Text>
          </View>
        ))
      )}
      <View style={styles.totalRow}>
        <Text style={[styles.cellBold, { width: "76%" }]}>TOTAL</Text>
        <Text style={[styles.cellBold, styles.colDetailAmt, styles.cellRight]}>
          {total}
        </Text>
      </View>
    </View>
  );
}

function SplitBar({
  left,
  right,
  leftColor,
  rightColor,
}: {
  left: number;
  right: number;
  leftColor: string;
  rightColor: string;
}) {
  const total = left + right;
  const leftGrow = total > 0 ? left : 1;
  const rightGrow = total > 0 ? right : 1;
  return (
    <View style={styles.barTrack}>
      <View style={{ flexGrow: leftGrow, flexShrink: 1, flexBasis: 0, backgroundColor: leftColor }} />
      <View style={{ flexGrow: rightGrow, flexShrink: 1, flexBasis: 0, backgroundColor: rightColor }} />
    </View>
  );
}

function RentCollectionTable({
  heading,
  rows,
  total,
}: {
  heading: string;
  rows: ReportPdfRentDetail[];
  total: string;
}) {
  return (
    <View wrap={false}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{heading}</Text>
      </View>
      <View style={styles.table}>
        <HeaderRow
          columns={[
            { label: "Unit", width: "18%" },
            { label: "Tenant", width: "24%" },
            { label: "Period", width: "14%" },
            { label: "Paid on", width: "20%" },
            { label: "Amount", width: "24%", right: true },
          ]}
        />
        {rows.length === 0 ? (
          <View style={styles.tableRow}>
            <Text style={styles.emptyCell}>No rent collected this way in the period.</Text>
          </View>
        ) : (
          rows.map((row, i) => (
            <View style={i % 2 === 1 ? styles.tableRowStripe : styles.tableRow} key={i}>
              <Text style={[styles.cell, { width: "18%" }]}>{row.unitLabel}</Text>
              <Text style={[styles.cell, { width: "24%" }]}>{row.tenantName}</Text>
              <Text style={[styles.cell, { width: "14%" }]}>{row.month}</Text>
              <Text style={[styles.cell, { width: "20%" }]}>{row.paidAt}</Text>
              <Text style={[styles.cell, { width: "24%" }, styles.cellRight]}>
                {row.amount}
              </Text>
            </View>
          ))
        )}
        <View style={styles.totalRow}>
          <Text style={[styles.cellBold, { width: "76%" }]}>TOTAL</Text>
          <Text style={[styles.cellBold, { width: "24%" }, styles.cellRight]}>
            {total}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function BuildingManagementReportDocument({
  propertyName,
  periodLabel,
  title,
  rentalRows,
  rentalTotal,
  expenseRows,
  expenseTotal,
  totalRentalCollection,
  companyCollection,
  landlordCollection,
  totalExpense,
  finalBalanceLabel,
  finalBalance,
  expenseDetails,
  agreementDetails,
  utilityDetails,
  expenseDetailsTotal,
  agreementDetailsTotal,
  utilityDetailsTotal,
  companyRentDetails,
  landlordRentDetails,
  generatedAt,
  chartSeries,
}: {
  propertyName: string;
  periodLabel: string;
  title: string;
  rentalRows: ReportPdfLine[];
  rentalTotal: ReportPdfLine;
  expenseRows: ReportPdfLine[];
  expenseTotal: ReportPdfLine;
  totalRentalCollection: string;
  companyCollection: string;
  landlordCollection: string;
  totalExpense: string;
  finalBalanceLabel: string;
  finalBalance: string;
  expenseDetails: ReportPdfDetail[];
  agreementDetails: ReportPdfDetail[];
  utilityDetails: ReportPdfDetail[];
  expenseDetailsTotal: string;
  agreementDetailsTotal: string;
  utilityDetailsTotal: string;
  companyRentDetails: ReportPdfRentDetail[];
  landlordRentDetails: ReportPdfRentDetail[];
  generatedAt: string;
  chartSeries: ReportPdfChartBar[];
}) {
  const isOwedToLandlord = finalBalanceLabel === "Balance Amount to Landlord";
  const companyAmt = Number(companyCollection.replace(/,/g, "")) || 0;
  const landlordAmt = Number(landlordCollection.replace(/,/g, "")) || 0;

  return (
    <Document title={`${propertyName} Summary Report`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerBar}>
          <Text style={styles.titleText}>{title}</Text>
          <Text style={styles.subtitleText}>
            {propertyName} · {periodLabel}
          </Text>
        </View>

        <View style={styles.kpis}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>With company</Text>
            <Text style={[styles.kpiValue, { color: COLORS.emerald }]}>
              OMR {companyCollection}
            </Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>With landlord</Text>
            <Text style={styles.kpiValue}>OMR {landlordCollection}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Total expenses</Text>
            <Text style={[styles.kpiValue, { color: COLORS.rose }]}>
              OMR {totalExpense}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Rental Collection</Text>
        </View>
        <SummaryTable rows={rentalRows} totalRow={rentalTotal} />
        <SplitBar
          left={companyAmt}
          right={landlordAmt}
          leftColor={COLORS.emerald}
          rightColor="#94A3B8"
        />
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: COLORS.emerald }]} />
            <Text style={styles.legendText}>Company</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: "#94A3B8" }]} />
            <Text style={styles.legendText}>Landlord</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Less Expense</Text>
        </View>
        <SummaryTable rows={expenseRows} totalRow={expenseTotal} />

        <DataReportChart series={chartSeries} />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Final Position</Text>
        </View>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={[styles.cell, { width: "70%" }]}>Rental Collection with Company</Text>
            <Text style={[styles.cell, { width: "30%" }, styles.cellRight]}>
              OMR {companyCollection}
            </Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.cell, { width: "70%" }]}>Total Expense</Text>
            <Text style={[styles.cell, { width: "30%" }, styles.cellRight]}>
              (OMR {totalExpense})
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.finalRow,
            { backgroundColor: isOwedToLandlord ? COLORS.emerald : COLORS.rose },
          ]}
        >
          <Text style={styles.finalLabel}>{finalBalanceLabel}</Text>
          <Text style={styles.finalValue}>OMR {finalBalance}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated {generatedAt}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>

      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerBar}>
          <Text style={styles.titleText}>Expense & Collection Details</Text>
          <Text style={styles.subtitleText}>
            {propertyName} · {periodLabel}
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Expenses</Text>
        </View>
        <DetailTable
          rows={expenseDetails}
          empty="No maintenance or administration expenses in this period."
          total={expenseDetailsTotal}
        />

        <View style={styles.twoCol}>
          <View style={styles.col}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>Agreement Registration</Text>
            </View>
            <DetailTable
              rows={agreementDetails}
              empty="No agreement registration fees in this period."
              total={agreementDetailsTotal}
            />
          </View>
          <View style={styles.col}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>Utilities</Text>
            </View>
            <DetailTable
              rows={utilityDetails}
              empty="No common utility bills in this period."
              total={utilityDetailsTotal}
            />
          </View>
        </View>

        <RentCollectionTable
          heading={`Rent collected by company — OMR ${companyCollection}`}
          rows={companyRentDetails}
          total={companyCollection}
        />
        <RentCollectionTable
          heading={`Rent collected by landlord — OMR ${landlordCollection}`}
          rows={landlordRentDetails}
          total={landlordCollection}
        />
        <View style={[styles.totalRow, { marginTop: 8, borderRadius: 5 }]}>
          <Text style={[styles.cellBold, { width: "70%" }]}>Total Rental Collection</Text>
          <Text style={[styles.cellBold, { width: "30%" }, styles.cellRight]}>
            OMR {totalRentalCollection}
          </Text>
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
