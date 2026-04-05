import * as XLSX from "xlsx";

export function downloadXlsx(
  sheetData: { name: string; data: Record<string, unknown>[] }[],
  fileName: string,
) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheetData) {
    const ws = XLSX.utils.json_to_sheet(sheet.data);
    // Auto-width columns
    const maxWidths: number[] = [];
    const keys = Object.keys(sheet.data[0] || {});
    keys.forEach((key, col) => {
      maxWidths[col] = Math.max(
        key.length,
        ...sheet.data.map((row) => String(row[key] ?? "").length),
      );
    });
    ws["!cols"] = maxWidths.map((w) => ({ wch: Math.min(w + 2, 40) }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
