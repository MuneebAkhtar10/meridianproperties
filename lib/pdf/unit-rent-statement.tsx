import {
  Circle,
  Document,
  G,
  Line,
  Page,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";

/**
 * A single tenancy's landlord statement — matches the layout of Rawazen's
 * existing per-unit statement documents: Building/Owner info, Resident/
 * Tenant info, a month-by-month rent collection log, the unit's expenses,
 * and the resulting balance. "Professional minimal, with icons" styling —
 * a small glyph per info field rather than a plain label/value grid.
 */

const COLORS = {
  primary: "#4F46E5",
  primaryDark: "#312E81",
  accentBg: "#EEF2FF",
  accentBgSoft: "#F5F3FF",
  stripe: "#FAFAFA",
  emerald: "#059669",
  emeraldBg: "#ECFDF5",
  rose: "#E11D48",
  roseBg: "#FFF1F2",
  muted: "#F8FAFC",
  mutedForeground: "#64748B",
  border: "#E2E8F0",
  foreground: "#0F172A",
};

const styles = StyleSheet.create({
  page: {
    padding: 28,
    paddingBottom: 38,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: COLORS.foreground,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 9,
  },
  headerIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextBlock: { flex: 1 },
  titleText: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primaryDark,
  },
  subtitleText: { fontSize: 8.5, color: COLORS.mutedForeground, marginTop: 1 },
  metaLabel: {
    fontSize: 6.5,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "right",
  },
  metaText: {
    fontSize: 8.5,
    color: COLORS.foreground,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    marginTop: 1,
  },
  headerRule: {
    height: 2,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.accentBg,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: 9,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  sectionIconBadge: {
    width: 13,
    height: 13,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeaderText: {
    fontFamily: "Helvetica-Bold",
    color: COLORS.primaryDark,
    fontSize: 9,
  },
  infoGrid: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
  infoGridRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  infoCell: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  infoCellLast: { borderRightWidth: 0 },
  infoCellBody: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  infoCellHighlight: { backgroundColor: COLORS.accentBgSoft },
  infoIconBadge: {
    width: 17,
    height: 17,
    borderRadius: 4,
    backgroundColor: COLORS.muted,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  infoLabel: {
    fontSize: 6,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoValue: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: COLORS.foreground,
    marginTop: 1,
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
    alignItems: "stretch",
    backgroundColor: COLORS.muted,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableRowStripe: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.stripe,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.accentBg,
  },
  colMonth: { flexGrow: 1.1, flexShrink: 1, flexBasis: 0 },
  colDate: { flexGrow: 1.7, flexShrink: 1, flexBasis: 0 },
  colAmount: { flexGrow: 1.4, flexShrink: 1, flexBasis: 0 },
  colReceived: { flexGrow: 2.2, flexShrink: 1, flexBasis: 0 },
  colTotalLabel: { flexGrow: 4.2, flexShrink: 1, flexBasis: 0 },
  colDesc: { flexGrow: 7, flexShrink: 1, flexBasis: 0 },
  colExpenseAmount: { flexGrow: 3, flexShrink: 1, flexBasis: 0 },
  cellHeader: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  cell: { paddingVertical: 6, paddingHorizontal: 8, fontSize: 8 },
  cellRight: { textAlign: "right" },
  cellBold: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primaryDark,
  },
  emptyCell: {
    padding: 8,
    fontSize: 8,
    color: COLORS.mutedForeground,
    fontFamily: "Helvetica-Oblique",
  },
  finalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 11,
    padding: 10,
    borderRadius: 7,
  },
  finalLabel: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "#FFFFFF" },
  finalValue: { fontFamily: "Helvetica-Bold", fontSize: 13, color: "#FFFFFF" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 5,
  },
  footerText: { fontSize: 7, color: COLORS.mutedForeground },
});

/** Small stroke-style glyphs (lucide's own path data, ISC-licensed —
 * @react-pdf/renderer has no icon-font support, so each one is redrawn as a
 * plain SVG here) — purely decorative, tying each info field to its kind at
 * a glance the way the reference "professional minimal" layout does. */
const ICONS = {
  building: (
    <>
      <Path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <Path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <Path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <Path d="M10 6h4" />
      <Path d="M10 10h4" />
      <Path d="M10 14h4" />
      <Path d="M10 18h4" />
    </>
  ),
  home: (
    <>
      <Path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <Path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  user: (
    <>
      <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </>
  ),
  phone: (
    <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  creditCard: (
    <>
      <Rect x="2" y="5" width="20" height="14" rx="2" />
      <Line x1="2" x2="22" y1="10" y2="10" />
    </>
  ),
  fileText: (
    <>
      <Path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <Path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <Path d="M10 9H8" />
      <Path d="M16 13H8" />
      <Path d="M16 17H8" />
    </>
  ),
  calendar: (
    <>
      <Path d="M8 2v4" />
      <Path d="M16 2v4" />
      <Rect x="3" y="4" width="18" height="18" rx="2" />
      <Path d="M3 10h18" />
    </>
  ),
  calendarCheck: (
    <>
      <Path d="M8 2v4" />
      <Path d="M16 2v4" />
      <Rect x="3" y="4" width="18" height="18" rx="2" />
      <Path d="M3 10h18" />
      <Path d="m9 16 2 2 4-4" />
    </>
  ),
  calendarX: (
    <>
      <Path d="M8 2v4" />
      <Path d="M16 2v4" />
      <Rect x="3" y="4" width="18" height="18" rx="2" />
      <Path d="M3 10h18" />
      <Path d="m14 14-4 4" />
      <Path d="m10 14 4 4" />
    </>
  ),
  shield: (
    <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  ),
  coins: (
    <>
      <Circle cx="8" cy="8" r="6" />
      <Path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <Path d="M7 6h1v4" />
      <Path d="m16.71 13.88.7.71-2.82 2.82" />
    </>
  ),
  hash: (
    <>
      <Line x1="4" x2="20" y1="9" y2="9" />
      <Line x1="4" x2="20" y1="15" y2="15" />
      <Line x1="10" x2="8" y1="3" y2="21" />
      <Line x1="16" x2="14" y1="3" y2="21" />
    </>
  ),
  idCard: (
    <>
      <Path d="M16 10h2" />
      <Path d="M16 14h2" />
      <Path d="M6.17 15a3 3 0 0 1 5.66 0" />
      <Circle cx="9" cy="11" r="2" />
      <Rect x="2" y="5" width="20" height="14" rx="2" />
    </>
  ),
  bedDouble: (
    <>
      <Path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" />
      <Path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
      <Path d="M12 4v6" />
      <Path d="M2 18h20" />
    </>
  ),
  landmark: (
    <>
      <Line x1="3" x2="21" y1="22" y2="22" />
      <Line x1="6" x2="6" y1="18" y2="11" />
      <Line x1="10" x2="10" y1="18" y2="11" />
      <Line x1="14" x2="14" y1="18" y2="11" />
      <Line x1="18" x2="18" y1="18" y2="11" />
      <Path d="M12 2 20 7 4 7Z" />
    </>
  ),
  scrollText: (
    <>
      <Path d="M15 12h-5" />
      <Path d="M15 8h-5" />
      <Path d="M19 17V5a2 2 0 0 0-2-2H4" />
      <Path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" />
    </>
  ),
  wallet: (
    <>
      <Path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <Path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </>
  ),
} as const;

export type InfoIconKey = keyof typeof ICONS;

/** A 24x24-viewBox stroke icon, rendered at a fixed pixel size — same
 * stroke idiom as lucide-react (round joins/caps, 2px stroke, no fill). */
function Icon({
  name,
  size = 10,
  color = COLORS.primary,
}: {
  name: InfoIconKey;
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G
        // @react-pdf/renderer applies these to every child that doesn't
        // override them, matching lucide's own stroke defaults.
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICONS[name]}
      </G>
    </Svg>
  );
}

const INFO_GRID_COLUMNS = 3;

function InfoCell({
  label,
  value,
  icon,
  last = false,
}: {
  label: string;
  value: string;
  icon: InfoIconKey;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoCell, last ? styles.infoCellLast : undefined]}>
      <View style={styles.infoIconBadge}>
        <Icon name={icon} size={9} />
      </View>
      <View style={styles.infoCellBody}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function EmptyInfoCell({ last = false }: { last?: boolean }) {
  return <View style={[styles.infoCell, last ? styles.infoCellLast : undefined]} />;
}

/** Always three equal columns per row. Short last rows are padded with
 * empty cells so Starting/Expire dates never stretch or overlap the
 * section below. */
function InfoGrid({ items }: { items: { label: string; value: string; icon: InfoIconKey }[] }) {
  const rows: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += INFO_GRID_COLUMNS) {
    rows.push(items.slice(i, i + INFO_GRID_COLUMNS));
  }
  return (
    <View style={styles.infoGrid}>
      {rows.map((row, ri) => (
        <View style={styles.infoGridRow} key={ri}>
          {Array.from({ length: INFO_GRID_COLUMNS }, (_, ci) => {
            const item = row[ci];
            const last = ci === INFO_GRID_COLUMNS - 1;
            if (!item) return <EmptyInfoCell key={`empty-${ci}`} last={last} />;
            return <InfoCell key={ci} {...item} last={last} />;
          })}
        </View>
      ))}
    </View>
  );
}

function SectionHeader({ icon, title }: { icon: InfoIconKey; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconBadge}>
        <Icon name={icon} size={9} color="#FFFFFF" />
      </View>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );
}

export type RentStatementPdfMonthRow = {
  month: string;
  transactionDate: string;
  amount: string;
  receivedBy: string;
};

export type RentStatementPdfExpenseRow = { description: string; amount: string };
export type RentStatementPdfInfoItem = { label: string; value: string; icon: InfoIconKey };

export function UnitRentStatementDocument({
  propertyName,
  unitLabel,
  periodLabel,
  buildingInfo,
  tenantInfo,
  monthlyRows,
  expenseRows,
  totalRentCollected,
  totalRentCollectedWithLandlord,
  totalExpenses,
  balanceLabel,
  balance,
  generatedAt,
}: {
  propertyName: string;
  unitLabel: string;
  periodLabel: string;
  buildingInfo: RentStatementPdfInfoItem[];
  tenantInfo: RentStatementPdfInfoItem[];
  monthlyRows: RentStatementPdfMonthRow[];
  expenseRows: RentStatementPdfExpenseRow[];
  totalRentCollected: string;
  totalRentCollectedWithLandlord?: string | null;
  totalExpenses: string;
  balanceLabel: string;
  balance: string;
  generatedAt: string;
}) {
  const isOwedToLandlord = balanceLabel.startsWith("Balance Amount to Landlord");

  return (
    <Document title={`Landlord Statement — ${propertyName} · ${unitLabel}`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerRow}>
          <View style={styles.headerIconBadge}>
            <Icon name="home" size={14} color="#FFFFFF" />
          </View>
          <View style={styles.headerTextBlock}>
            <Text style={styles.titleText}>Landlord Statement</Text>
            <Text style={styles.subtitleText}>
              {propertyName} · {unitLabel} · {periodLabel}
            </Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Generated</Text>
            <Text style={styles.metaText}>{generatedAt}</Text>
          </View>
        </View>
        <View style={styles.headerRule} />

        <SectionHeader icon="building" title="Building / Owner Information" />
        <InfoGrid items={buildingInfo} />

        <SectionHeader icon="user" title="Resident / Tenant Information" />
        <InfoGrid items={tenantInfo} />

        <SectionHeader icon="landmark" title="Rental Collection" />
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <View style={styles.colMonth}>
              <Text style={styles.cellHeader}>Month</Text>
            </View>
            <View style={styles.colDate}>
              <Text style={styles.cellHeader}>Transaction Date</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={[styles.cellHeader, styles.cellRight]}>Amount</Text>
            </View>
            <View style={styles.colReceived}>
              <Text style={styles.cellHeader}>Received By</Text>
            </View>
          </View>
          {monthlyRows.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={styles.emptyCell}>
                No rent collected against this unit for the period.
              </Text>
            </View>
          ) : (
            monthlyRows.map((row, i) => (
              <View style={i % 2 === 1 ? styles.tableRowStripe : styles.tableRow} key={i}>
                <View style={styles.colMonth}>
                  <Text style={styles.cell}>{row.month}</Text>
                </View>
                <View style={styles.colDate}>
                  <Text style={styles.cell}>{row.transactionDate}</Text>
                </View>
                <View style={styles.colAmount}>
                  <Text style={[styles.cell, styles.cellRight]}>{row.amount}</Text>
                </View>
                <View style={styles.colReceived}>
                  <Text style={styles.cell}>{row.receivedBy}</Text>
                </View>
              </View>
            ))
          )}
          <View style={styles.totalRow}>
            <View style={styles.colTotalLabel}>
              <Text style={styles.cellBold}>Total Rent Collected with Company</Text>
            </View>
            <View style={styles.colReceived}>
              <Text style={[styles.cellBold, styles.cellRight]}>
                OMR {totalRentCollected}
              </Text>
            </View>
          </View>
          {totalRentCollectedWithLandlord ? (
            <View style={styles.totalRow}>
              <View style={styles.colTotalLabel}>
                <Text style={styles.cellBold}>Total Rent Collected with Landlord</Text>
              </View>
              <View style={styles.colReceived}>
                <Text style={[styles.cellBold, styles.cellRight]}>
                  OMR {totalRentCollectedWithLandlord}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <SectionHeader icon="wallet" title="Expense Sheet" />
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <View style={styles.colDesc}>
              <Text style={styles.cellHeader}>Description</Text>
            </View>
            <View style={styles.colExpenseAmount}>
              <Text style={[styles.cellHeader, styles.cellRight]}>Amount</Text>
            </View>
          </View>
          {expenseRows.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={styles.emptyCell}>
                No expenses logged against this unit for the period.
              </Text>
            </View>
          ) : (
            expenseRows.map((row, i) => (
              <View style={i % 2 === 1 ? styles.tableRowStripe : styles.tableRow} key={i}>
                <View style={styles.colDesc}>
                  <Text style={styles.cell}>{row.description}</Text>
                </View>
                <View style={styles.colExpenseAmount}>
                  <Text style={[styles.cell, styles.cellRight]}>{row.amount}</Text>
                </View>
              </View>
            ))
          )}
          <View style={styles.totalRow}>
            <View style={styles.colDesc}>
              <Text style={styles.cellBold}>Total Expenses</Text>
            </View>
            <View style={styles.colExpenseAmount}>
              <Text style={[styles.cellBold, styles.cellRight]}>
                OMR {totalExpenses}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.finalRow,
            { backgroundColor: isOwedToLandlord ? COLORS.emerald : COLORS.rose },
          ]}
        >
          <Text style={styles.finalLabel}>{balanceLabel}</Text>
          <Text style={styles.finalValue}>OMR {balance}</Text>
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
