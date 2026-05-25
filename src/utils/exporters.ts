import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { SummaryRow } from '../types';

const headers = ['SETOR', 'TIPO', 'QUANTIDADE', 'METROS', 'KM'];

function essentialRows(rows: SummaryRow[]): (string | number)[][] {
  return rows.map((row) => [
    row.sector,
    row.type,
    row.quantity,
    row.meters > 0 ? Math.round(row.meters) : '-',
    row.km > 0 ? Number(row.km.toFixed(2)) : '-',
  ]);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportCsv(rows: SummaryRow[], fileName = 'kmz-analyzer-ftth.csv'): void {
  const csv = [headers, ...essentialRows(rows)]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName);
}

export function exportExcel(rows: SummaryRow[], fileName = 'kmz-analyzer-ftth.xlsx'): void {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...essentialRows(rows)]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Resumo');
  XLSX.writeFile(workbook, fileName);
}

export function exportPdf(rows: SummaryRow[], fileName = 'kmz-analyzer-ftth.pdf'): void {
  const pdf = new jsPDF({ orientation: 'landscape' });
  pdf.setFontSize(14);
  pdf.text('KMZ Analyzer FTTH', 14, 16);
  autoTable(pdf, {
    head: [headers],
    body: essentialRows(rows),
    startY: 24,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 64, 93] },
  });
  pdf.save(fileName);
}
