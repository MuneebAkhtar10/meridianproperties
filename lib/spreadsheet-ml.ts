/** SpreadsheetML (Excel 2003 XML). Excel and Sheets open this as a real
 * workbook — borders, fills, column widths, merged cells — which a CSV
 * cannot represent. */

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SpreadsheetCell = {
  value?: string | number;
  style?: string;
  mergeAcross?: number;
  number?: boolean;
};

export type SpreadsheetRow = {
  cells: SpreadsheetCell[];
  height?: number;
};

export type SpreadsheetSheet = {
  name: string;
  columns: number[];
  rows: SpreadsheetRow[];
};

function cellXml(cell: SpreadsheetCell): string {
  const merge =
    cell.mergeAcross && cell.mergeAcross > 0
      ? ` ss:MergeAcross="${cell.mergeAcross}"`
      : "";
  const style = cell.style ? ` ss:StyleID="${cell.style}"` : "";
  if (cell.value === undefined || cell.value === "") {
    return `<Cell${style}${merge}/>`;
  }
  if (typeof cell.value === "number" || cell.number) {
    return `<Cell${style}${merge}><Data ss:Type="Number">${cell.value}</Data></Cell>`;
  }
  return `<Cell${style}${merge}><Data ss:Type="String">${xmlEscape(String(cell.value))}</Data></Cell>`;
}

function rowXml(row: SpreadsheetRow): string {
  const height = row.height ? ` ss:Height="${row.height}"` : "";
  return `<Row${height}>${row.cells.map(cellXml).join("")}</Row>`;
}

const DEFAULT_STYLES = `
  <Style ss:ID="Default" ss:Name="Normal">
    <Alignment ss:Vertical="Center" ss:WrapText="1"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#0F172A"/>
    <Interior/>
  </Style>
  <Style ss:ID="Title">
    <Alignment ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#312E81"/>
  </Style>
  <Style ss:ID="Subtitle">
    <Alignment ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#64748B"/>
  </Style>
  <Style ss:ID="Section">
    <Alignment ss:Vertical="Center" ss:WrapText="1"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#312E81"/>
    <Interior ss:Color="#EEF2FF" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
    </Borders>
  </Style>
  <Style ss:ID="Label">
    <Alignment ss:Vertical="Center" ss:WrapText="1"/>
    <Font ss:FontName="Calibri" ss:Size="9" ss:Color="#64748B"/>
    <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    </Borders>
  </Style>
  <Style ss:ID="Value">
    <Alignment ss:Vertical="Center" ss:WrapText="1"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
    <Borders>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    </Borders>
  </Style>
  <Style ss:ID="Th">
    <Alignment ss:Vertical="Center" ss:WrapText="1"/>
    <Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#64748B"/>
    <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    </Borders>
  </Style>
  <Style ss:ID="Td">
    <Alignment ss:Vertical="Center" ss:WrapText="1"/>
    <Font ss:FontName="Calibri" ss:Size="10"/>
    <Borders>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    </Borders>
  </Style>
  <Style ss:ID="TdRight">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10"/>
    <NumberFormat ss:Format="#,##0.000"/>
    <Borders>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    </Borders>
  </Style>
  <Style ss:ID="Total">
    <Alignment ss:Vertical="Center" ss:WrapText="1"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#312E81"/>
    <Interior ss:Color="#EEF2FF" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
    </Borders>
  </Style>
  <Style ss:ID="TotalRight">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#312E81"/>
    <Interior ss:Color="#EEF2FF" ss:Pattern="Solid"/>
    <NumberFormat ss:Format="#,##0.000"/>
    <Borders>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
    </Borders>
  </Style>
  <Style ss:ID="BalancePay">
    <Alignment ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#059669" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="BalancePayRight">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#059669" ss:Pattern="Solid"/>
    <NumberFormat ss:Format="&quot;OMR &quot;#,##0.000"/>
  </Style>
  <Style ss:ID="BalanceCollect">
    <Alignment ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#E11D48" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="BalanceCollectRight">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#E11D48" ss:Pattern="Solid"/>
    <NumberFormat ss:Format="&quot;OMR &quot;#,##0.000"/>
  </Style>
`;

export function buildSpreadsheetMl(sheet: SpreadsheetSheet): string {
  const columns = sheet.columns
    .map(
      (width, index) =>
        `<Column ss:Index="${index + 1}" ss:AutoFitWidth="0" ss:Width="${width}"/>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:x="urn:schemas-microsoft-com:office:excel">
  <Styles>${DEFAULT_STYLES}</Styles>
  <Worksheet ss:Name="${xmlEscape(sheet.name.slice(0, 31))}">
    <Table>${columns}${sheet.rows.map(rowXml).join("")}</Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <PageSetup>
        <Layout x:Orientation="Portrait"/>
        <Header x:Margin="0.2"/>
        <Footer x:Margin="0.2"/>
        <PageMargins x:Bottom="0.4" x:Left="0.45" x:Right="0.45" x:Top="0.4"/>
      </PageSetup>
      <FitToPage/>
      <Print>
        <FitWidth>1</FitWidth>
        <ValidPrinterInfo/>
      </Print>
    </WorksheetOptions>
  </Worksheet>
</Workbook>
`;
}
