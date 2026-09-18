// Lightweight CSV export utility (no deps). Uses ; as separator (Excel SRB friendly)
// and prefixes BOM for UTF-8 so ćžšđč renders correctly in Excel.

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined | Date;
};

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else s = String(v);
  // Quote if contains separator, quote, or newline
  if (/[";\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const sep = ";";
  const head = columns.map((c) => escapeCell(c.header)).join(sep);
  const body = rows
    .map((r) => columns.map((c) => escapeCell(c.value(r))).join(sep))
    .join("\r\n");
  return `\uFEFF${head}\r\n${body}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  downloadCsv(filename, toCsv(rows, columns));
}
