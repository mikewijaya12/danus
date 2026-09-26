import * as XLSX from 'xlsx';

/** Export an array of plain objects to an .xlsx file (client-side download). */
export function exportToExcel<T extends Record<string, unknown>>(
  rows: T[],
  fileName: string,
  sheetName = 'Sheet1',
) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${fileName}-${stamp}.xlsx`);
}

/** A single named sheet to include in a multi-sheet workbook export. */
export interface SheetSpec {
  name: string;
  rows: Record<string, unknown>[];
}

/**
 * Export multiple named sheets into a single .xlsx workbook (client-side download).
 * Empty sheets are still written (with a placeholder row) so the tab is visible.
 */
export function exportSheetsToExcel(sheets: SheetSpec[], fileName: string) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sheet of sheets) {
    // Excel sheet names must be <=31 chars and unique within a workbook.
    let name = (sheet.name || 'Sheet').slice(0, 31);
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const suffix = ` (${n++})`;
      name = `${sheet.name.slice(0, 31 - suffix.length)}${suffix}`;
    }
    used.add(name.toLowerCase());
    const rows = sheet.rows.length ? sheet.rows : [{ '(kosong)': 'Tidak ada data' }];
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${fileName}-${stamp}.xlsx`);
}

/** Parse the first sheet of an uploaded Excel/CSV file into JSON rows. */
export async function parseExcel<T = Record<string, unknown>>(file: File): Promise<T[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const first = wb.SheetNames[0];
  const ws = wb.Sheets[first];
  return XLSX.utils.sheet_to_json<T>(ws, { defval: null });
}

/** Build a downloadable template with the given headers and one example row. */
export function downloadTemplate(headers: string[], example: Record<string, unknown>, fileName: string) {
  const ws = XLSX.utils.json_to_sheet([example], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
