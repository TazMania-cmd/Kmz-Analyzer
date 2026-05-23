import JSZip from 'jszip';
import {
  AnalysisResult,
  CategorySummary,
  Coordinate,
  CountCategory,
  KmlPlacemark,
  KmlTreeNode,
  MetricCategory,
  ReportCategory,
  SectorReport,
} from '../types/kmz';
import { classificationToReportCategory, classifyPath, classifyText, detectSectorName, isSectorFolderName } from './classification';
import { lineLengthMeters, polygonAreaSquareMeters } from './distance';
import { buildMaterialDashboard } from './materials';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const COUNT_CATEGORIES: CountCategory[] = ['POSTES', 'CTO', 'CEO'];
const METRIC_CATEGORIES: MetricCategory[] = ['CABOS', 'CORDOALHAS', 'BACKBONE', 'RAMAIS'];
const AREA_CATEGORY = 'AREA X CABEAR';
const ALL_REPORT_CATEGORIES: ReportCategory[] = [
  ...COUNT_CATEGORIES,
  ...METRIC_CATEGORIES,
  AREA_CATEGORY,
  'ESTIMATIVA',
  'OUTROS',
];

type FolderModel = {
  id: string;
  name: string;
  path: string[];
  classification: ReturnType<typeof classifyText>;
  placemarks: KmlPlacemark[];
  children: FolderModel[];
};

export async function analyzeKmzOrKml(file: File): Promise<AnalysisResult> {
  validateFile(file);

  const kmlText = file.name.toLowerCase().endsWith('.kmz')
    ? await extractKmlFromKmz(file)
    : await file.text();

  return parseKmlText(kmlText, file.name);
}

function validateFile(file: File): void {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.kmz') && !lowerName.endsWith('.kml')) {
    throw new Error('Envie um arquivo com extensao .kmz ou .kml.');
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('O arquivo e muito grande. O limite local configurado e de 50 MB.');
  }
}

async function extractKmlFromKmz(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const kmlEntry = Object.values(zip.files).find((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.kml'));

  if (!kmlEntry) {
    throw new Error('Este KMZ nao possui um arquivo KML interno.');
  }

  return kmlEntry.async('text');
}

function parseKmlText(kmlText: string, fileName: string): AnalysisResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Nao foi possivel ler o KML. Verifique se o arquivo XML esta valido.');
  }

  const documentNode = doc.getElementsByTagName('Document')[0] ?? doc.documentElement;
  const projectName = getDirectText(documentNode, 'name') ?? fileName.replace(/\.(kmz|kml)$/i, '');
  const root = parseContainer(documentNode, projectName, []);
  const allPlacemarks = collectPlacemarks(root);

  if (allPlacemarks.length === 0) {
    throw new Error('O KML nao possui Placemarks para analise.');
  }

  const sectorFolders = findSectorFolders(root);
  const warnings = new Set<string>();

  if (sectorFolders.length === 0) {
    warnings.add('Nenhuma macroarea no padrao M1, M2, M3 foi encontrada. As pastas principais foram usadas como setores.');
  }

  const sectors = (sectorFolders.length > 0 ? sectorFolders : root.children).map((folder) => buildSectorReport(folder));
  const totals = buildGeneralTotals(sectors);
  const materials = buildMaterialDashboard(sectors);

  return {
    fileName,
    projectName,
    tree: toTreeNode(root),
    sectors,
    totals,
    materials,
    detectedStructure: buildDetectedStructure(root, sectors),
    warnings: Array.from(warnings),
  };
}

function parseContainer(container: Element, fallbackName: string, parentPath: string[]): FolderModel {
  const name = getDirectText(container, 'name') ?? fallbackName;
  const path = [...parentPath, name];
  const id = path.join(' / ');
  const classification = parentPath.length === 0 || isSectorFolderName(name) ? 'SETOR' : classifyText(name);
  const placemarks = directChildren(container, 'Placemark').map((placemark, index) => parsePlacemark(placemark, path, index));
  const children = directChildren(container, 'Folder').map((folder) => parseContainer(folder, 'Sem nome', path));

  return { id, name, path, classification, placemarks, children };
}

function parsePlacemark(placemark: Element, path: string[], index: number): KmlPlacemark {
  const name = getDirectText(placemark, 'name') ?? 'Sem nome';
  const description = getDirectText(placemark, 'description');
  const lineStrings = Array.from(placemark.getElementsByTagName('LineString')).map((line) =>
    parseCoordinates(line.getElementsByTagName('coordinates')[0]?.textContent ?? ''),
  );
  const pointCoordinates = Array.from(placemark.getElementsByTagName('Point')).flatMap((point) =>
    parseCoordinates(point.getElementsByTagName('coordinates')[0]?.textContent ?? ''),
  );
  const polygonRings = Array.from(placemark.getElementsByTagName('Polygon')).map((polygon) =>
    parseCoordinates(polygon.getElementsByTagName('coordinates')[0]?.textContent ?? ''),
  );

  return {
    id: `${path.join(' / ')} / ${name} #${index}`,
    name,
    description,
    path,
    semanticCategory: classifyPath(path, name),
    pointCoordinates,
    lineStrings,
    pointCount: pointCoordinates.length,
    lineCount: lineStrings.filter((line) => line.length >= 2).length,
    polygonCount: polygonRings.filter((ring) => ring.length >= 3).length,
    lengthMeters: round(lineStrings.reduce((total, line) => total + (line.length >= 2 ? lineLengthMeters(line) : 0), 0)),
    areaSquareMeters: round(polygonRings.reduce((total, ring) => total + polygonAreaSquareMeters(ring), 0)),
  };
}

function findSectorFolders(root: FolderModel): FolderModel[] {
  const sectors: FolderModel[] = [];

  walkFolders(root, (folder) => {
    if (isSectorFolderName(folder.name)) {
      sectors.push(folder);
    }
  });

  return sectors;
}

function buildSectorReport(folder: FolderModel): SectorReport {
  const categoryMap = createCategoryMap();
  const placemarks = collectPlacemarks(folder);

  collectFolders(folder).forEach((currentFolder) => {
    const category = resolveCategory(currentFolder.path.slice(folder.path.length));
    if (category === 'ESTIMATIVA') return;

    currentFolder.placemarks.forEach((placemark) => {
      addPlacemarkToCategory(categoryMap.get(category)!, placemark, currentFolder.name);
    });
  });

  return {
    id: folder.id,
    name: detectSectorName(folder.path),
    path: folder.path,
    detectedName: folder.name,
    categories: visibleCategories(categoryMap),
    placemarks,
    placemarkCount: placemarks.length,
  };
}

function buildGeneralTotals(sectors: SectorReport[]) {
  const categoryMap = createCategoryMap();
  let placemarks = 0;

  sectors.forEach((sector) => {
    placemarks += sector.placemarkCount;
    sector.categories.forEach((category) => {
      const total = categoryMap.get(category.category)!;
      total.itemCount += category.itemCount;
      total.lengthMeters += category.lengthMeters;
      total.areaSquareMeters += category.areaSquareMeters;
      category.layerNames.forEach((layer) => {
        if (!total.layerNames.includes(layer)) total.layerNames.push(layer);
      });
    });
  });

  categoryMap.forEach((summary) => {
    summary.lengthMeters = round(summary.lengthMeters);
    summary.lengthKilometers = round(summary.lengthMeters / 1000);
    summary.areaSquareMeters = round(summary.areaSquareMeters);
  });

  return {
    categories: visibleCategories(categoryMap),
    sectors: sectors.length,
    placemarks,
  };
}

function addPlacemarkToCategory(summary: CategorySummary, placemark: KmlPlacemark, layerName: string): void {
  if (COUNT_CATEGORIES.includes(summary.category as CountCategory)) {
    summary.itemCount += placemark.pointCount > 0 ? placemark.pointCount : 1;
  }

  if (METRIC_CATEGORIES.includes(summary.category as MetricCategory)) {
    summary.itemCount += placemark.lineCount;
    summary.lengthMeters = round(summary.lengthMeters + placemark.lengthMeters);
    summary.lengthKilometers = round(summary.lengthMeters / 1000);
  }

  if (summary.category === AREA_CATEGORY) {
    summary.itemCount += placemark.polygonCount;
    summary.areaSquareMeters = round(summary.areaSquareMeters + placemark.areaSquareMeters);
  }

  if (!summary.layerNames.includes(layerName)) summary.layerNames.push(layerName);
}

function resolveCategory(relativePath: string[]): ReportCategory {
  const semantic = classifyPath(relativePath);
  const category = classificationToReportCategory(semantic);
  return ALL_REPORT_CATEGORIES.includes(category as ReportCategory) ? (category as ReportCategory) : 'OUTROS';
}

function createCategoryMap(): Map<ReportCategory, CategorySummary> {
  return new Map(
    ALL_REPORT_CATEGORIES.map((category) => [
      category,
      {
        category,
        itemCount: 0,
        lengthMeters: 0,
        lengthKilometers: 0,
        areaSquareMeters: 0,
        layerNames: [],
      },
    ]),
  );
}

function visibleCategories(categoryMap: Map<ReportCategory, CategorySummary>): CategorySummary[] {
  return Array.from(categoryMap.values()).filter(
    (category) => category.itemCount > 0 || category.lengthMeters > 0 || category.areaSquareMeters > 0,
  );
}

function toTreeNode(folder: FolderModel): KmlTreeNode {
  return {
    id: folder.id,
    name: folder.name,
    path: folder.path,
    classification: folder.classification,
    placemarkCount: collectPlacemarks(folder).length,
    children: folder.children.map(toTreeNode),
  };
}

function buildDetectedStructure(root: FolderModel, sectors: SectorReport[]) {
  const sectorIds = new Set(sectors.map((sector) => sector.id));
  const folderRows = collectFolders(root).map((folder) => ({
    id: folder.id,
    originalName: folder.name,
    path: folder.path.join(' > '),
    classification: folder.classification,
    type: sectorIds.has(folder.id) || folder.path.length <= 1 ? ('PASTA PAI' as const) : ('SUBPASTA' as const),
    elementCount: collectPlacemarks(folder).length,
  }));

  const placemarkRows = collectPlacemarks(root).map((placemark) => ({
    id: placemark.id,
    originalName: placemark.name,
    path: [...placemark.path, placemark.name].join(' > '),
    classification: placemark.semanticCategory,
    type: placemark.lineCount > 0 ? ('LINESTRING' as const) : placemark.polygonCount > 0 ? ('POLYGON' as const) : placemark.pointCount > 0 ? ('POINT' as const) : ('PLACEMARK' as const),
    elementCount: placemark.lineCount || placemark.polygonCount || placemark.pointCount || 1,
    meters: placemark.lengthMeters || undefined,
  }));

  return [...folderRows, ...placemarkRows];
}

function collectFolders(folder: FolderModel): FolderModel[] {
  return [folder, ...folder.children.flatMap(collectFolders)];
}

function collectPlacemarks(folder: FolderModel): KmlPlacemark[] {
  return [...folder.placemarks, ...folder.children.flatMap(collectPlacemarks)];
}

function walkFolders(folder: FolderModel, visitor: (folder: FolderModel) => void): void {
  folder.children.forEach((child) => {
    visitor(child);
    walkFolders(child, visitor);
  });
}

function parseCoordinates(rawCoordinates: string): Coordinate[] {
  return rawCoordinates
    .trim()
    .split(/\s+/)
    .map((chunk) => {
      const [lon, lat] = chunk.split(',').map(Number);
      return Number.isFinite(lon) && Number.isFinite(lat) ? ([lon, lat] as Coordinate) : undefined;
    })
    .filter((coordinate): coordinate is Coordinate => Boolean(coordinate));
}

function directChildren(parent: Element, tagName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === tagName || child.tagName === tagName);
}

function getDirectText(parent: Element, tagName: string): string | undefined {
  const child = directChildren(parent, tagName)[0];
  const text = child?.textContent?.trim();
  return text || undefined;
}

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
