import JSZip from 'jszip';
import type {
  AnalyzedItem,
  AnalysisResult,
  CableSummaryRow,
  CountType,
  FolderContext,
  GeometryType,
  ManualMappings,
  SummaryRow,
  TreeNode,
  UnknownFolder,
} from '../types';
import { lineLengthMeters, parseCoordinates } from './distance';
import { classifyExactFolder, identifyCableType, isProjectRootName } from './normalize';

const LINE_TYPES: CountType[] = ['RAMAIS', 'BACKBONE', 'CORDOALHAS'];
const POINT_TYPES: CountType[] = ['CTO', 'CEO', 'POSTES'];
const ALL_TYPES: CountType[] = ['CTO', 'CEO', 'POSTES', 'RAMAIS', 'BACKBONE', 'CORDOALHAS'];

interface TraversalState {
  items: AnalyzedItem[];
  unknownFolders: Map<string, UnknownFolder>;
  validation: string[];
  manualMappings: ManualMappings;
}

export async function analyzeFile(file: File, manualMappings: ManualMappings = {}): Promise<AnalysisResult> {
  const kml = await readKmlText(file);
  return analyzeKmlText(kml, file.name, manualMappings);
}

export function analyzeKmlText(kmlText: string, fileName: string, manualMappings: ManualMappings = {}): AnalysisResult {
  const parser = new DOMParser();
  const documentXml = parser.parseFromString(kmlText, 'application/xml');
  const parseError = documentXml.querySelector('parsererror');
  if (parseError) {
    throw new Error('Arquivo KML inválido ou corrompido.');
  }

  const rootElement = firstElement(documentXml, ['Document', 'Folder']) ?? documentXml.documentElement;
  const rootName = getChildText(rootElement, 'name') || fileName.replace(/\.(kmz|kml)$/i, '');
  const rootPath = rootName || 'PROJETO';
  const root: TreeNode = {
    id: rootPath,
    name: rootPath,
    fullPath: rootPath,
    children: [],
    placemarkCount: 0,
  };

  const state: TraversalState = {
    items: [],
    unknownFolders: new Map(),
    validation: [],
    manualMappings,
  };

  traverseContainer(rootElement, root, {
    ancestors: [],
    path: rootPath,
    context: { ignored: false, sector: isProjectRootName(rootName) ? undefined : rootName },
    state,
    isRoot: true,
  });

  const rows = buildSummaryRows(state.items);
  const cableRows = buildCableSummaryRows(state.items);
  return {
    fileName,
    root,
    items: state.items,
    rows,
    cableRows,
    unknownFolders: Array.from(state.unknownFolders.values()),
    validation: state.validation,
  };
}

async function readKmlText(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'kml') {
    return file.text();
  }
  if (extension !== 'kmz') {
    throw new Error('Envie um arquivo .KMZ ou .KML.');
  }

  const zip = await JSZip.loadAsync(file);
  const kmlEntry =
    zip.file(/(^|\/)doc\.kml$/i)[0] ??
    zip.file(/\.kml$/i).sort((a, b) => a.name.localeCompare(b.name))[0];

  if (!kmlEntry) {
    throw new Error('KMZ sem arquivo KML interno.');
  }

  return kmlEntry.async('text');
}

function traverseContainer(
  element: Element,
  treeNode: TreeNode,
  params: {
    ancestors: string[];
    path: string;
    context: FolderContext;
    state: TraversalState;
    isRoot: boolean;
  },
): void {
  for (const child of Array.from(element.children)) {
    if (localName(child) === 'Folder' || localName(child) === 'Document') {
      const folderName = getChildText(child, 'name') || 'Sem nome';
      const fullPath = `${params.path} > ${folderName}`;
      const childTree: TreeNode = {
        id: fullPath,
        name: folderName,
        fullPath,
        children: [],
        placemarkCount: 0,
      };
      treeNode.children.push(childTree);

      const context = deriveFolderContext(folderName, fullPath, params, child);
      traverseContainer(child, childTree, {
        ancestors: [...params.ancestors, folderName],
        path: fullPath,
        context,
        state: params.state,
        isRoot: false,
      });
      treeNode.placemarkCount += childTree.placemarkCount;
      continue;
    }

    if (localName(child) === 'Placemark') {
      treeNode.placemarkCount += 1;
      processPlacemark(child, params);
    }
  }
}

function deriveFolderContext(
  folderName: string,
  fullPath: string,
  params: {
    ancestors: string[];
    context: FolderContext;
    state: TraversalState;
    isRoot: boolean;
  },
  folderElement: Element,
): FolderContext {
  const manual = params.state.manualMappings[fullPath];
  if (manual === 'IGNORAR') {
    return { ...params.context, ignored: true, type: undefined };
  }
  if (manual === 'SETOR') {
    return { ...params.context, sector: folderName, ignored: false, type: undefined };
  }
  if (manual === 'CABOS' || manual === 'REDE_MISTA') {
    return { ...params.context, ignored: false, type: undefined };
  }
  if (manual) {
    return { ...params.context, ignored: false, type: manual };
  }

  const exact = classifyExactFolder(folderName);
  const geometryCounts = countFolderGeometries(folderElement);
  let sector = params.context.sector;
  const insideOperationalContext = Boolean(params.context.type) || params.ancestors.some((ancestor) => Boolean(classifyExactFolder(ancestor)));
  if (!params.isRoot && !isProjectRootName(folderName) && !exact && !insideOperationalContext && (params.ancestors.length === 0 || !sector)) {
    sector = folderName;
  }

  if (!exact) {
    if (params.context.type === 'RAMAIS' || params.context.type === 'BACKBONE' || params.context.type === 'CORDOALHAS') {
      return { ...params.context, sector, ignored: false };
    }

    if (params.ancestors.some((ancestor) => classifyExactFolder(ancestor) === 'CABOS') && identifyCableType(folderName)) {
      return { ...params.context, sector, ignored: false, type: 'RAMAIS' };
    }

    if (params.context.type === 'CTO' && geometryCounts.lineStringCount > 0 && geometryCounts.pointCount === 0) {
      return { ...params.context, sector, ignored: false, type: 'RAMAIS' };
    }

    const hasPlacemarks = Array.from(folderElement.getElementsByTagName('*')).some((node) => localName(node) === 'Placemark');
    if (!params.isRoot && !sector && hasPlacemarks) {
      params.state.unknownFolders.set(fullPath, {
        id: fullPath,
        name: folderName,
        fullPath,
        parentPath: params.ancestors.join(' > '),
      });
    }
    return { ...params.context, sector, ignored: false };
  }

  if (exact === 'CABOS') {
    return { ...params.context, sector, ignored: false };
  }

  if (exact === 'RAMAIS' || exact === 'BACKBONE') {
    return { ...params.context, sector, ignored: false, type: exact };
  }

  return { ...params.context, sector, ignored: false, type: exact };
}

function processPlacemark(
  placemark: Element,
  params: {
    ancestors: string[];
    path: string;
    context: FolderContext;
    state: TraversalState;
  },
): void {
  if (params.context.ignored || !params.context.type) {
    return;
  }

  const name = getChildText(placemark, 'name') || 'Sem nome';
  const geometryType = getGeometryType(placemark);
  const expectedGeometry = POINT_TYPES.includes(params.context.type) ? 'Point' : 'LineString';

  if (geometryType !== expectedGeometry) {
    params.state.validation.push(
      `${params.path} > ${name}: ${params.context.type} exige ${expectedGeometry}, recebido ${geometryType}.`,
    );
    return;
  }

  const meters = LINE_TYPES.includes(params.context.type) ? getLineStringLength(placemark) : 0;
  const cableGroup = params.context.type === 'RAMAIS' || params.context.type === 'BACKBONE' ? params.context.type : undefined;
  const cableType = cableGroup ? identifyCableType(`${params.path} > ${name}`) : undefined;
  const sector = params.context.sector ?? firstSectorFromAncestors(params.ancestors) ?? 'Sem setor';
  const item: AnalyzedItem = {
    id: `${params.path} > ${name}`,
    name,
    geometryType,
    parentFolder: params.ancestors[params.ancestors.length - 1] ?? '',
    ancestors: [...params.ancestors],
    fullPath: `${params.path} > ${name}`,
    sector,
    type: params.context.type,
    meters,
    cableGroup,
    cableType,
  };
  params.state.items.push(item);
}

function getGeometryType(placemark: Element): GeometryType {
  if (findDescendant(placemark, 'Point')) return 'Point';
  if (findDescendant(placemark, 'LineString')) return 'LineString';
  if (findDescendant(placemark, 'Polygon')) return 'Polygon';
  if (findDescendant(placemark, 'MultiGeometry')) return 'MultiGeometry';
  return 'Unknown';
}

function countFolderGeometries(element: Element): { pointCount: number; lineStringCount: number; polygonCount: number } {
  const counts = {
    pointCount: 0,
    lineStringCount: 0,
    polygonCount: 0,
  };

  for (const placemark of Array.from(element.getElementsByTagName('*')).filter((node) => localName(node) === 'Placemark')) {
    const geometryType = getGeometryType(placemark);
    if (geometryType === 'Point') counts.pointCount += 1;
    if (geometryType === 'LineString') counts.lineStringCount += 1;
    if (geometryType === 'Polygon') counts.polygonCount += 1;
  }

  return counts;
}

function getLineStringLength(placemark: Element): number {
  let total = 0;
  for (const line of findDescendants(placemark, 'LineString')) {
    const coordinates = getChildText(line, 'coordinates');
    if (coordinates) {
      total += lineLengthMeters(parseCoordinates(coordinates));
    }
  }
  return total;
}

function buildSummaryRows(items: AnalyzedItem[]): SummaryRow[] {
  const sectors = Array.from(new Set(items.map((item) => item.sector))).sort((a, b) => a.localeCompare(b));
  const grouped = new Map<string, SummaryRow>();

  for (const sector of sectors) {
    for (const type of ALL_TYPES) {
      grouped.set(`${sector}:${type}`, { sector, type, quantity: 0, meters: 0, km: 0 });
    }
  }

  for (const item of items) {
    const key = `${item.sector}:${item.type}`;
    const row = grouped.get(key) ?? { sector: item.sector, type: item.type, quantity: 0, meters: 0, km: 0 };
    row.quantity += 1;
    row.meters += item.meters;
    row.km = row.meters / 1000;
    grouped.set(key, row);
  }

  return Array.from(grouped.values()).filter((row) => row.quantity > 0 || row.meters > 0);
}

function buildCableSummaryRows(items: AnalyzedItem[]): CableSummaryRow[] {
  const grouped = new Map<string, CableSummaryRow>();

  for (const item of items) {
    if (!item.cableGroup || !item.cableType) continue;
    const key = `${item.sector}:${item.cableGroup}:${item.cableType}`;
    const row = grouped.get(key) ?? {
      sector: item.sector,
      group: item.cableGroup,
      cable: item.cableType,
      quantity: 0,
      meters: 0,
      km: 0,
    };
    row.quantity += 1;
    row.meters += item.meters;
    row.km = row.meters / 1000;
    grouped.set(key, row);
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const sectorSort = a.sector.localeCompare(b.sector);
    if (sectorSort !== 0) return sectorSort;
    const groupSort = a.group.localeCompare(b.group);
    if (groupSort !== 0) return groupSort;
    return a.cable.localeCompare(b.cable);
  });
}

function firstSectorFromAncestors(ancestors: string[]): string | undefined {
  return ancestors.find((ancestor) => !isProjectRootName(ancestor) && !classifyExactFolder(ancestor));
}

function firstElement(documentXml: Document, names: string[]): Element | undefined {
  return Array.from(documentXml.getElementsByTagName('*')).find((element) => names.includes(localName(element)));
}

function getChildText(element: Element, childName: string): string {
  const child = Array.from(element.children).find((node) => localName(node) === childName);
  return child?.textContent?.trim() ?? '';
}

function findDescendant(element: Element, name: string): Element | undefined {
  return Array.from(element.getElementsByTagName('*')).find((node) => localName(node) === name);
}

function findDescendants(element: Element, name: string): Element[] {
  return Array.from(element.getElementsByTagName('*')).filter((node) => localName(node) === name);
}

function localName(element: Element): string {
  return element.localName || element.nodeName.split(':').pop() || element.nodeName;
}
