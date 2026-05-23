export type Coordinate = [number, number];

export type MetricCategory = 'CABOS' | 'CORDOALHAS' | 'BACKBONE' | 'RAMAIS';
export type CountCategory = 'POSTES' | 'CTO' | 'CEO';
export type AreaCategory = 'AREA X CABEAR';
export type ReportCategory = CountCategory | MetricCategory | AreaCategory | 'ESTIMATIVA' | 'OUTROS';
export type SemanticClassification =
  | 'SETOR'
  | 'POSTES'
  | 'CTO'
  | 'CEO'
  | 'CABOS'
  | 'RAMAIS'
  | 'BACKBONE'
  | 'CORDOALHAS'
  | 'AREA'
  | 'ESTIMATIVA'
  | 'NAO CLASSIFICADO';

export type KmlPlacemark = {
  id: string;
  name: string;
  description?: string;
  path: string[];
  semanticCategory: SemanticClassification;
  pointCoordinates: Coordinate[];
  lineStrings: Coordinate[][];
  pointCount: number;
  lineCount: number;
  polygonCount: number;
  lengthMeters: number;
  areaSquareMeters: number;
};

export type KmlTreeNode = {
  id: string;
  name: string;
  path: string[];
  classification: SemanticClassification;
  placemarkCount: number;
  children: KmlTreeNode[];
};

export type DetectedStructureRow = {
  id: string;
  originalName: string;
  path: string;
  classification: SemanticClassification | string;
  type: 'PASTA PAI' | 'SUBPASTA' | 'POINT' | 'LINESTRING' | 'POLYGON' | 'PLACEMARK';
  elementCount: number;
  meters?: number;
};

export type CategorySummary = {
  category: ReportCategory;
  itemCount: number;
  lengthMeters: number;
  lengthKilometers: number;
  areaSquareMeters: number;
  layerNames: string[];
};

export type SectorReport = {
  id: string;
  name: string;
  path: string[];
  detectedName: string;
  categories: CategorySummary[];
  placemarks: KmlPlacemark[];
  placemarkCount: number;
};

export type GeneralTotals = {
  categories: CategorySummary[];
  sectors: number;
  placemarks: number;
};

export type AnalysisResult = {
  fileName: string;
  projectName: string;
  tree: KmlTreeNode;
  sectors: SectorReport[];
  totals: GeneralTotals;
  materials: MaterialDashboard;
  detectedStructure: DetectedStructureRow[];
  warnings: string[];
};

export type MaterialUnit = 'METRO' | 'UNIDADE' | 'ROLO' | 'ROLO 25MT CADA';
export type MaterialCategory =
  | 'CABOS'
  | 'POSTES'
  | 'CTO'
  | 'CEO'
  | 'ACESSORIOS'
  | 'CORDOALHAS'
  | 'OLHAL'
  | 'ROLOS'
  | 'OUTROS';
export type MaterialOriginType = 'CONTADO NO PROJETO' | 'CALCULADO';

export type MaterialEstimateRow = {
  id: string;
  sectorId: string;
  sectorName: string;
  material: string;
  unit: MaterialUnit;
  rule: string;
  quantity: number;
  origin: string;
  originType: MaterialOriginType;
  category: MaterialCategory;
};

export type MaterialSourceItem = {
  id: string;
  sectorId: string;
  sectorName: string;
  originalName: string;
  description?: string;
  material: string;
  category: MaterialCategory;
  geometryType: 'POINT' | 'LINESTRING' | 'POLYGON' | 'CALCULATED';
  originFolder: string;
  quantity: number;
};

export type MaterialTotal = {
  material: string;
  unit: MaterialUnit;
  category: MaterialCategory;
  total: number;
  bySector: Record<string, number>;
};

export type MaterialDashboard = {
  rows: MaterialEstimateRow[];
  totalsByMaterial: MaterialTotal[];
  sourceItems: MaterialSourceItem[];
  cableDebug: CableDebugInfo;
};

export type CableSize = '06' | '12' | '24' | '36' | '72' | '144';

export type CableLineDebug = {
  id: string;
  sectorId: string;
  sectorName: string;
  originalName: string;
  originFolder: string;
  path: string;
  meters: number;
  coordinates: Coordinate[];
  classifiedAs?: `CABO ASU ${CableSize} F.O`;
};

export type CeoCableConnection = {
  cableLineId: string;
  cableName: string;
  cableType: `CABO ASU ${CableSize} F.O`;
  meters: number;
  distanceMeters: number;
  connectionKind: 'INICIO' | 'FIM' | 'ATRAVESSA' | 'TOCA';
};

export type CeoSangriaDebug = {
  ceoId: string;
  ceoName: string;
  sectorId: string;
  sectorName: string;
  path: string;
  connectedCables: CeoCableConnection[];
  reserveMeters: number;
};

export type CtoAsu06TerminationDebug = {
  ctoId: string;
  ctoName: string;
  sectorId: string;
  sectorName: string;
  cableLineId: string;
  cableName: string;
  type: 'PASSANTE' | 'FINAL';
  connectionKind: 'INICIO' | 'FIM' | 'ATRAVESSA' | 'TOCA';
  distanceMeters: number;
  reserveMeters: number;
};

export type CtoAsu06DetectionDebug = {
  lineId: string;
  lineName: string;
  segmentIndex: number;
  ctoId: string;
  ctoName: string;
  detectedType: 'PASSANTE' | 'FINAL';
  connectionKind: 'INICIO' | 'FIM' | 'ATRAVESSA' | 'TOCA';
  distanceMeters: number;
  intersectionPoint: Coordinate;
  duplicateIgnored: boolean;
};

export type CableDebugInfo = {
  totalLineStrings: number;
  cableFolderLineStrings: number;
  classifiedLineStrings: number;
  unclassifiedLineStrings: number;
  originalNames: string[];
  classifiedLines: CableLineDebug[];
  unclassifiedLines: CableLineDebug[];
  ceoSangrias: CeoSangriaDebug[];
  reserveMetersBySectorAndSize: Record<string, Record<CableSize, number>>;
  ctoAsu06Terminations: CtoAsu06TerminationDebug[];
  ctoAsu06DetectionLog: CtoAsu06DetectionDebug[];
  ctoAsu06ReserveBySector: Record<string, number>;
};
