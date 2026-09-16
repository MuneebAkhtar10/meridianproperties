/// Quotes a value for CSV per RFC 4180: wrap in quotes and escape any quote
/// inside it. Values are always quoted rather than only-when-needed — simpler
/// and still valid, and avoids edge cases with leading zeros / dates.
function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/// Builds a CSV document (with a header row) from plain string/number cells.
/// Uses CRLF line endings, which is what Excel expects.
export function buildCsv(header: string[], rows: (string | number)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}
