import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { AnalysisResult, CategorySummary, SectorReport } from '../types/kmz';

export function exportCsv(result: AnalysisResult): void {
  const rows = buildMaterialRows(result);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  downloadBlob(csv, 'relatorio-kmz.csv', 'text/csv;charset=utf-8;');
}

export function exportXlsx(result: AnalysisResult): void {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildSummaryRows(result)), 'Resumo');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildFlatRows(result)), 'Setores');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildMaterialRows(result)), 'Materiais');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildMaterialTotalRows(result)), 'Totais Materiais');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildDetectedStructureRows(result)), 'Estrutura Detectada');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildCableDebugSummaryRows(result)), 'Debug Cabos');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildCeoSangriaRows(result)), 'CEOs Sangria');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildCtoAsu06Rows(result)), 'CTO ASU06');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildCtoAsu06DetectionLogRows(result)), 'Debug CTO ASU06');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildCableLineRows(result, 'classified')), 'Cabos Classificados');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildCableLineRows(result, 'unclassified')), 'Cabos Sem Classe');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildTotalRows(result)), 'Total Geral');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildTreeRows(result.tree)), 'Arvore KMZ');

  XLSX.writeFile(workbook, 'relatorio-kmz.xlsx');
}

function buildCeoSangriaRows(result: AnalysisResult) {
  return result.materials.cableDebug.ceoSangrias.map((ceo) => ({
    CEO: ceo.ceoName,
    Setor: ceo.sectorName,
    Caminho: ceo.path,
    CabosConectados: ceo.connectedCables.map((connection) => connection.cableType).join(' | '),
    DebugConexao: ceo.connectedCables
      .map((connection) => `${connection.cableType}: ${connection.connectionKind}, ${connection.distanceMeters}m`)
      .join(' | '),
    ReservaTotal: ceo.reserveMeters,
  }));
}

function buildCtoAsu06Rows(result: AnalysisResult) {
  return [...result.materials.cableDebug.ctoAsu06Terminations]
    .sort((a, b) => {
      const sectorCompare = a.sectorName.localeCompare(b.sectorName, 'pt-BR', { numeric: true });
      if (sectorCompare !== 0) return sectorCompare;
      const ramalCompare = compareProjectCode(a.cableName, b.cableName);
      if (ramalCompare !== 0) return ramalCompare;
      return compareProjectCode(a.ctoName, b.ctoName);
    })
    .map((item) => ({
      CTO: item.ctoName,
      Setor: item.sectorName,
      LinhaASU06: item.cableName,
      Tipo: item.type,
      Conexao: item.connectionKind,
      DistanciaAteCTO: item.distanceMeters,
      ReservaAplicada: item.reserveMeters,
    }));
}

function buildCtoAsu06DetectionLogRows(result: AnalysisResult) {
  return result.materials.cableDebug.ctoAsu06DetectionLog.map((item) => ({
    LineId: item.lineId,
    NomeLinha: item.lineName,
    Segmento: item.segmentIndex,
    CtoId: item.ctoId,
    CTO: item.ctoName,
    TipoDetectado: item.detectedType,
    Conexao: item.connectionKind,
    Distancia: item.distanceMeters,
    PontoIntersecao: `${item.intersectionPoint[1]},${item.intersectionPoint[0]}`,
    DuplicataIgnorada: item.duplicateIgnored ? 'SIM' : 'NAO',
  }));
}

function buildCableDebugSummaryRows(result: AnalysisResult) {
  const debug = result.materials.cableDebug;
  return [
    { Indicador: 'Total de LineStrings encontradas', Valor: debug.totalLineStrings },
    { Indicador: 'LineStrings dentro de CABOS/BACKBONE/RAMAIS/CORDOALHAS', Valor: debug.cableFolderLineStrings },
    { Indicador: 'LineStrings classificadas', Valor: debug.classifiedLineStrings },
    { Indicador: 'LineStrings nao classificadas', Valor: debug.unclassifiedLineStrings },
    { Indicador: 'Total de CTOs encontradas', Valor: countCtos(result) },
    { Indicador: 'Linhas ASU 06 encontradas', Valor: debug.classifiedLines.filter((line) => line.classifiedAs === 'CABO ASU 06 F.O').length },
    { Indicador: 'CTOs onde ASU 06 termina', Valor: debug.ctoAsu06Terminations.length },
    { Indicador: 'Nomes originais encontrados', Valor: debug.originalNames.join(' | ') },
  ];
}

function buildCableLineRows(result: AnalysisResult, type: 'classified' | 'unclassified') {
  const lines = type === 'classified' ? result.materials.cableDebug.classifiedLines : result.materials.cableDebug.unclassifiedLines;
  return lines.map((line) => ({
    Setor: line.sectorName,
    NomeOriginal: line.originalName,
    PastaOrigem: line.originFolder,
    Caminho: line.path,
    Metragem: line.meters,
    Classificacao: line.classifiedAs ?? 'CABOS NAO CLASSIFICADOS',
  }));
}

function countCtos(result: AnalysisResult): number {
  return result.sectors.reduce((total, sector) => {
    return (
      total +
      sector.placemarks.filter((placemark) => {
        const pathHasCto = placemark.path.some((part) => part.trim().toUpperCase() === 'CTO');
        return placemark.pointCount > 0 && (pathHasCto || /\bCTO\b/i.test(placemark.name));
      }).length
    );
  }, 0);
}

function compareProjectCode(a: string, b: string): number {
  const keyA = extractProjectCodeSortKey(a);
  const keyB = extractProjectCodeSortKey(b);

  if (keyA.main !== keyB.main) return keyA.main - keyB.main;
  if (keyA.sub !== keyB.sub) return keyA.sub - keyB.sub;
  return a.localeCompare(b, 'pt-BR', { numeric: true });
}

function extractProjectCodeSortKey(value: string): { main: number; sub: number } {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const match = normalized.match(/\bM(?:YA|AY)\s*(\d+)(?:\.(\d+))?/);

  if (!match) return { main: Number.MAX_SAFE_INTEGER, sub: Number.MAX_SAFE_INTEGER };

  return {
    main: Number(match[1]),
    sub: match[2] ? Number(match[2]) : 0,
  };
}

export function exportPdf(result: AnalysisResult): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const margin = 40;

  pdf.setFontSize(16);
  pdf.text(result.projectName, margin, 44);
  pdf.setFontSize(10);
  pdf.text(`Arquivo: ${result.fileName}`, margin, 62);

  autoTable(pdf, {
    startY: 84,
    head: [['Setor', 'Material', 'Unidade', 'Regra', 'Quantidade', 'Origem']],
    body: buildMaterialRows(result).map((row) => [
      row.Setor,
      row.Material,
      row.Unidade,
      row.Regra,
      String(row.Quantidade),
      row.Origem,
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 118, 110] },
    margin: { left: margin, right: margin },
  });

  const finalY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 84;
  autoTable(pdf, {
    startY: finalY + 24,
    head: [['Material', 'Unidade', 'Categoria', 'Total']],
    body: buildMaterialTotalRows(result).map((row) => [
      row.Material,
      row.Unidade,
      row.Categoria,
      String(row.Total),
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
    margin: { left: margin, right: margin },
  });

  pdf.save('relatorio-kmz.pdf');
}

function buildSummaryRows(result: AnalysisResult) {
  return [
    { Indicador: 'Projeto', Valor: result.projectName },
    { Indicador: 'Arquivo', Valor: result.fileName },
    { Indicador: 'Setores', Valor: result.totals.sectors },
    { Indicador: 'Placemarks', Valor: result.totals.placemarks },
  ];
}

function buildFlatRows(result: AnalysisResult) {
  return result.sectors.flatMap((sector) =>
    sector.categories.map((category) => ({
      Setor: sector.name,
      Categoria: category.category,
      Quantidade: category.itemCount,
      Metros: category.lengthMeters,
      Quilometros: category.lengthKilometers,
      MetrosQuadrados: category.areaSquareMeters,
      Camadas: category.layerNames.join(' | '),
    })),
  );
}

function buildMaterialRows(result: AnalysisResult) {
  return result.materials.rows.map((row) => ({
    Setor: row.sectorName,
    Material: row.material,
    Unidade: row.unit,
    Regra: row.rule,
    Quantidade: row.quantity,
    Origem: row.origin,
    TipoOrigem: row.originType,
    Categoria: row.category,
  }));
}

function buildMaterialTotalRows(result: AnalysisResult) {
  return result.materials.totalsByMaterial.map((row) => ({
    Material: row.material,
    Unidade: row.unit,
    Categoria: row.category,
    Total: row.total,
    Setores: Object.entries(row.bySector)
      .map(([sector, quantity]) => `${sector}: ${quantity}`)
      .join(' | '),
  }));
}

function buildDetectedStructureRows(result: AnalysisResult) {
  return result.detectedStructure.map((row) => ({
    PastaOriginal: row.originalName,
    Caminho: row.path,
    Classificacao: row.classification,
    Tipo: row.type,
    QuantidadeElementos: row.elementCount,
    Metros: row.meters ?? '',
  }));
}

function buildTotalRows(result: AnalysisResult) {
  return result.totals.categories.map((category) => ({
    Categoria: category.category,
    Quantidade: category.itemCount,
    Metros: category.lengthMeters,
    Quilometros: category.lengthKilometers,
    MetrosQuadrados: category.areaSquareMeters,
    Camadas: category.layerNames.join(' | '),
  }));
}

function buildTreeRows(node: AnalysisResult['tree'], level = 0): Array<{ Nivel: number; Pasta: string; Caminho: string; Placemarks: number }> {
  return [
    {
      Nivel: level,
      Pasta: node.name,
      Caminho: node.path.join(' / '),
      Placemarks: node.placemarkCount,
    },
    ...node.children.flatMap((child) => buildTreeRows(child, level + 1)),
  ];
}

export function formatCategoryValue(category: CategorySummary): string {
  if (category.areaSquareMeters > 0) return `${formatNumber(category.areaSquareMeters)} m2`;
  if (category.lengthMeters > 0) return `${formatNumber(category.lengthMeters)} m`;
  return `${category.itemCount}`;
}

export function formatSectorText(sector: SectorReport): string {
  return sector.categories.map((category) => `${category.category}: ${formatCategoryValue(category)}`).join('\n');
}

export function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function downloadBlob(content: string, fileName: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
