export type CountType = 'CTO' | 'CEO' | 'POSTES' | 'RAMAIS' | 'BACKBONE' | 'CORDOALHAS';

export type CableGroup = 'RAMAIS' | 'BACKBONE';

export type CableType = 'CABO 06 F.O' | 'CABO 12 F.O' | 'CABO 24 F.O' | 'CABO 36 F.O' | 'CABO 72 F.O' | 'CABO 144 F.O';

export type GeometryType = 'Point' | 'LineString' | 'Polygon' | 'MultiGeometry' | 'Unknown';

export type ManualMappingValue = CountType | 'SETOR' | 'CABOS' | 'IGNORAR' | 'REDE_MISTA';

export type ManualMappings = Record<string, ManualMappingValue>;

export interface TreeNode {
  id: string;
  name: string;
  fullPath: string;
  children: TreeNode[];
  placemarkCount: number;
}

export interface AnalyzedItem {
  id: string;
  name: string;
  geometryType: GeometryType;
  parentFolder: string;
  ancestors: string[];
  fullPath: string;
  sector: string;
  type: CountType;
  meters: number;
  cableGroup?: CableGroup;
  cableType?: CableType;
}

export interface SummaryRow {
  sector: string;
  type: CountType;
  quantity: number;
  meters: number;
  km: number;
}

export interface CableSummaryRow {
  sector: string;
  group: CableGroup;
  cable: CableType;
  quantity: number;
  meters: number;
  km: number;
}

export interface UnknownFolder {
  id: string;
  name: string;
  fullPath: string;
  parentPath: string;
}

export interface AnalysisResult {
  fileName: string;
  root: TreeNode;
  items: AnalyzedItem[];
  rows: SummaryRow[];
  cableRows: CableSummaryRow[];
  unknownFolders: UnknownFolder[];
  validation: string[];
}

export interface FolderContext {
  sector?: string;
  type?: CountType;
  ignored: boolean;
}
