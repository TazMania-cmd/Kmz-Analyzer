import {
  CableDebugInfo,
  CableLineDebug,
  CableSize,
  CeoSangriaDebug,
  Coordinate,
  CtoAsu06DetectionDebug,
  CtoAsu06TerminationDebug,
  MaterialCategory,
  MaterialDashboard,
  MaterialEstimateRow,
  MaterialSourceItem,
  MaterialUnit,
  SectorReport,
} from '../types/kmz';
import { haversineMeters, lineLengthMeters } from './distance';

type MaterialDefinition = {
  material: string;
  unit: MaterialUnit;
  rule: string;
  origin: string;
  category: MaterialCategory;
  quantity: (sector: SectorReport, context: SectorContext) => number;
  originType?: MaterialEstimateRow['originType'];
};

type SectorContext = {
  postes: number;
  ceo: number;
  cto: number;
  applicableCableMeters: number;
  cordoalhaMeters: number;
  cableMetersBySize: Record<CableSize, number>;
  asu06LinearMeters: number;
  asu06CtoReserveMeters: number;
  asu06CtoTerminations: number;
  unclassifiedCableMetersBySector: Record<string, number>;
};

const CABLE_SIZES: CableSize[] = ['06', '12', '24', '36', '72', '144'];
const CABLE_FOLDER_NAMES = ['CABOS', 'BACKBONE', 'RAMAIS', 'CORDOALHAS'];
const CEO_CONNECTION_TOLERANCE_METERS = 3;
const CEO_RESERVE_METERS_PER_CABLE = 15;
const CTO_TERMINATION_TOLERANCE_METERS = 3;
const CTO_RESERVE_METERS_ASU06 = 15;

export function buildMaterialDashboard(sectors: SectorReport[]): MaterialDashboard {
  const cableDebug = buildCableDebug(sectors);
  const rows = sectors.flatMap((sector) => {
    const context = buildSectorContext(sector, cableDebug);
    return materialDefinitions.map((definition) => {
      const quantity = roundPhysical(definition.quantity(sector, context), definition.unit);
      return {
        id: `${sector.id}::${definition.material}`,
        sectorId: sector.id,
        sectorName: sector.name,
        material: definition.material,
        unit: definition.unit,
        rule: definition.rule,
        quantity,
        origin: definition.origin,
        originType: definition.originType ?? (definition.origin.startsWith('Calculado') ? 'CALCULADO' : 'CONTADO NO PROJETO'),
        category: definition.category,
      };
    });
  });

  return {
    rows,
    totalsByMaterial: buildTotals(rows),
    sourceItems: buildMaterialSourceItems(sectors),
    cableDebug,
  };
}

const materialDefinitions: MaterialDefinition[] = [
  ...CABLE_SIZES.map<MaterialDefinition>((size) => ({
    material: `CABO ASU ${size} F.O`,
    unit: 'METRO',
    rule: size === '06' ? 'METRAGEM LINEAR + RESERVA CEO/CTO' : 'SOMAR LINESTRINGS CLASSIFICADAS POR BITOLA + RESERVA CEO',
    origin: size === '06' ? 'Linhas + reservas CEO/CTO' : 'Linhas em CABOS/BACKBONE/RAMAIS/CORDOALHAS',
    category: 'CABOS',
    quantity: (_sector, context) => context.cableMetersBySize[size],
  })),
  {
    material: 'CABOS NAO CLASSIFICADOS',
    unit: 'METRO',
    rule: 'LINESTRINGS EM PASTAS DE CABO SEM BITOLA IDENTIFICADA',
    origin: 'Linhas nao classificadas do KMZ',
    category: 'CABOS',
    quantity: (sector, context) => context.unclassifiedCableMetersBySector[sector.id] ?? 0,
  },
  {
    material: 'CEO',
    unit: 'UNIDADE',
    rule: 'CONTAR PASTA OU NOME CEO',
    origin: 'Pasta CEO ou nome do item',
    category: 'CEO',
    quantity: (_sector, context) => context.ceo,
  },
  {
    material: 'CEO 96/144',
    unit: 'UNIDADE',
    rule: 'CONTAR ITENS CEO 96/144',
    origin: 'Pasta CEO ou nome do item',
    category: 'CEO',
    quantity: (sector) => countMatchingPoints(sector, (text) => hasTerms(text, ['CEO']) && /96\s*\/?\s*144/.test(text)),
  },
  {
    material: 'CTO',
    unit: 'UNIDADE',
    rule: 'CONTAR PASTA OU NOME CTO',
    origin: 'Pasta CTO ou nome do item',
    category: 'CTO',
    quantity: (_sector, context) => context.cto,
  },
  {
    material: 'POSTES',
    unit: 'UNIDADE',
    rule: 'CONTAR PASTA POSTES',
    origin: 'Pasta POSTES',
    category: 'POSTES',
    quantity: (_sector, context) => context.postes,
  },
  {
    material: 'PLAQUETA',
    unit: 'UNIDADE',
    rule: '1 POR POSTE',
    origin: 'Calculado por postes',
    category: 'ACESSORIOS',
    quantity: (_sector, context) => context.postes,
  },
  {
    material: 'ANEL GUIA',
    unit: 'UNIDADE',
    rule: '4 POR POSTE',
    origin: 'Calculado por postes',
    category: 'ACESSORIOS',
    quantity: (_sector, context) => context.postes * 4,
  },
  {
    material: 'BAP 2',
    unit: 'UNIDADE',
    rule: '75% DOS POSTES',
    origin: 'Calculado por postes',
    category: 'ACESSORIOS',
    quantity: (_sector, context) => context.postes * 0.75,
  },
  {
    material: 'BAP 3',
    unit: 'UNIDADE',
    rule: '25% DOS POSTES',
    origin: 'Calculado por postes',
    category: 'ACESSORIOS',
    quantity: (_sector, context) => context.postes * 0.25,
  },
  {
    material: 'CRUZETA',
    unit: 'UNIDADE',
    rule: '1 POR CEO NO POSTE',
    origin: 'Calculado por CEO',
    category: 'ACESSORIOS',
    quantity: (_sector, context) => context.ceo,
  },
  {
    material: 'CORDOALHA DIELETRICA',
    unit: 'METRO',
    rule: 'SOMAR LINHAS DA PASTA CORDOALHAS',
    origin: 'Pasta CORDOALHAS',
    category: 'CORDOALHAS',
    quantity: (_sector, context) => context.cordoalhaMeters,
  },
  {
    material: 'ALCA DE CORDOALHA',
    unit: 'UNIDADE',
    rule: 'CONTAR ALCA DE CORDOALHA OU PONTOS DE FIXACAO',
    origin: 'Nome/camada no KMZ',
    category: 'CORDOALHAS',
    quantity: (sector) => countMatchingPoints(sector, (text) => hasTerms(text, ['ALCA', 'CORDOALHA']) || hasTerms(text, ['FIXACAO', 'CORDOALHA'])),
  },
  {
    material: 'ALCA CABO 06 E 12',
    unit: 'UNIDADE',
    rule: 'CONTAR OLHAIS RELACIONADOS AOS CABOS 06 E 12',
    origin: 'OLHAL por nome/camada',
    category: 'OLHAL',
    quantity: (sector) => countOlhaisForCableSizes(sector, ['06', '12']),
  },
  {
    material: 'ALCA CABO 24 E 36',
    unit: 'UNIDADE',
    rule: 'CONTAR OLHAIS RELACIONADOS AOS CABOS 24 E 36',
    origin: 'OLHAL por nome/camada',
    category: 'OLHAL',
    quantity: (sector) => countOlhaisForCableSizes(sector, ['24', '36']),
  },
  {
    material: 'ALCA CABO 72',
    unit: 'UNIDADE',
    rule: 'CONTAR OLHAIS RELACIONADOS AO CABO 72',
    origin: 'OLHAL por nome/camada',
    category: 'OLHAL',
    quantity: (sector) => countOlhaisForCableSizes(sector, ['72']),
  },
  {
    material: 'ALCA CABO 144',
    unit: 'UNIDADE',
    rule: 'CONTAR OLHAIS RELACIONADOS AO CABO 144',
    origin: 'OLHAL por nome/camada',
    category: 'OLHAL',
    quantity: (sector) => countOlhaisForCableSizes(sector, ['144']),
  },
  {
    material: 'OLHAL',
    unit: 'UNIDADE',
    rule: 'CONTAR OLHAL NO PROJETO',
    origin: 'Nome/camada no KMZ',
    category: 'OLHAL',
    quantity: (sector) => countMatchingPoints(sector, (text) => hasWord(text, 'OLHAL')),
  },
  {
    material: 'DIELETRICO DUPLO',
    unit: 'UNIDADE',
    rule: 'CONTAR DIELETRICO DUPLO NO PROJETO',
    origin: 'Nome/camada no KMZ',
    category: 'OLHAL',
    quantity: (sector) => countMatchingPoints(sector, (text) => hasTerms(text, ['DIELETRICO', 'DUPLO'])),
  },
  {
    material: 'ARAME DE SPINAR',
    unit: 'ROLO',
    rule: '1 ROLO PARA CADA 2KM DE CABO/CORDOALHA',
    origin: 'Calculado por metragem aplicavel',
    category: 'ROLOS',
    quantity: (_sector, context) => Math.ceil((context.applicableCableMeters + context.cordoalhaMeters) / 2000),
  },
  {
    material: 'ESPIRAL TUBE',
    unit: 'ROLO',
    rule: '1 ROLO PARA CADA 3KM',
    origin: 'Calculado por metragem aplicavel',
    category: 'ROLOS',
    quantity: (_sector, context) => Math.ceil((context.applicableCableMeters + context.cordoalhaMeters) / 3000),
  },
  {
    material: 'FITA DE ACO',
    unit: 'ROLO 25MT CADA',
    rule: 'CALCULAR CONFORME NECESSIDADE DO PROJETO',
    origin: 'Itens FITA DE ACO no KMZ',
    category: 'ROLOS',
    quantity: (sector) => countMatchingPoints(sector, (text) => hasTerms(text, ['FITA', 'ACO'])),
  },
  ...['FECHO INOX', 'ACOMODADOR OPTICO', 'GROMET', 'SPLITER'].map<MaterialDefinition>((material) => ({
    material,
    unit: 'UNIDADE',
    rule: `CONTAR ${material} NO PROJETO`,
    origin: 'Nome/camada no KMZ',
    category: 'OUTROS',
    quantity: (sector) => countMatchingPoints(sector, (text) => hasMaterialName(text, material)),
  })),
  {
    material: 'TUBO LOOSE',
    unit: 'METRO',
    rule: 'SOMAR METRAGEM CORRESPONDENTE',
    origin: 'Linha/camada TUBO LOOSE',
    category: 'OUTROS',
    quantity: (sector) => sumLineMeters(sector, (text) => hasTerms(text, ['TUBO', 'LOOSE'])),
  },
  {
    material: 'ESPIRAL',
    unit: 'METRO',
    rule: 'SOMAR METRAGEM CORRESPONDENTE',
    origin: 'Linha/camada ESPIRAL',
    category: 'OUTROS',
    quantity: (sector) => sumLineMeters(sector, (text) => hasWord(text, 'ESPIRAL') && !hasWord(text, 'TUBE')),
  },
];

function buildCableDebug(sectors: SectorReport[]): CableDebugInfo {
  const classifiedLines: CableLineDebug[] = [];
  const unclassifiedLines: CableLineDebug[] = [];
  const originalNames = new Set<string>();
  let totalLineStrings = 0;
  let cableFolderLineStrings = 0;

  sectors.forEach((sector) => {
    sector.placemarks.forEach((placemark) => {
      if (placemark.lineCount <= 0) return;

      placemark.lineStrings.forEach((lineString, lineIndex) => {
        if (lineString.length < 2) return;
        const lineMeters = round(lineLengthMeters(lineString));
        if (lineMeters <= 0) return;

        totalLineStrings += 1;
        originalNames.add(placemark.name);

        if (!isCableFolderPath(placemark.path)) return;
        cableFolderLineStrings += 1;

        const text = searchableText(placemark.name, placemark.path);
        const cableSize = detectCableSize(text);
        const lineDebug: CableLineDebug = {
          id: `${placemark.id}::line-${lineIndex}`,
          sectorId: sector.id,
          sectorName: sector.name,
          originalName: placemark.name,
          originFolder: placemark.path[placemark.path.length - 1] ?? sector.name,
          path: placemark.path.join(' / '),
          meters: lineMeters,
          coordinates: lineString,
          classifiedAs: cableSize ? `CABO ASU ${cableSize} F.O` : undefined,
        };

        if (cableSize) classifiedLines.push(lineDebug);
        else unclassifiedLines.push(lineDebug);
      });
    });
  });

  const ceoSangrias = buildCeoSangriaDebug(sectors, classifiedLines);
  const reserveMetersBySectorAndSize = buildReserveMetersBySectorAndSize(ceoSangrias);
  const ctoAsu06Analysis = buildCtoAsu06Terminations(sectors, classifiedLines);
  const ctoAsu06Terminations = ctoAsu06Analysis.terminations;
  const ctoAsu06ReserveBySector = buildCtoAsu06ReserveBySector(ctoAsu06Terminations);

  return {
    totalLineStrings,
    cableFolderLineStrings,
    classifiedLineStrings: classifiedLines.length,
    unclassifiedLineStrings: unclassifiedLines.length,
    originalNames: Array.from(originalNames).sort(),
    classifiedLines,
    unclassifiedLines,
    ceoSangrias,
    reserveMetersBySectorAndSize,
    ctoAsu06Terminations,
    ctoAsu06DetectionLog: ctoAsu06Analysis.detectionLog,
    ctoAsu06ReserveBySector,
  };
}

function buildCeoSangriaDebug(sectors: SectorReport[], cableLines: CableLineDebug[]): CeoSangriaDebug[] {
  return sectors.flatMap((sector) => {
    const sectorCableLines = cableLines.filter((line) => line.sectorId === sector.id && line.classifiedAs);
    const ceos = sector.placemarks.filter((placemark) => isCeoPlacemark(placemark.name, placemark.path) && placemark.pointCoordinates.length > 0);

    return ceos
      .map((ceo) => {
        const connectedByCableType = new Map<string, CeoSangriaDebug['connectedCables'][number]>();

        ceo.pointCoordinates.forEach((point) => {
          sectorCableLines.forEach((line) => {
            const hit = pointToLineStringHit(point, line.coordinates);
            if (hit.distanceMeters > CEO_CONNECTION_TOLERANCE_METERS || !line.classifiedAs) return;

            const current = connectedByCableType.get(line.classifiedAs);
            if (!current || hit.distanceMeters < current.distanceMeters || hit.connectionKind === 'ATRAVESSA') {
              connectedByCableType.set(line.classifiedAs, {
                cableLineId: line.id,
                cableName: line.originalName,
                cableType: line.classifiedAs,
                meters: line.meters,
                distanceMeters: round(hit.distanceMeters),
                connectionKind: hit.connectionKind,
              });
            }
          });
        });

        const connectedCables = Array.from(connectedByCableType.values());
        return {
          ceoId: ceo.id,
          ceoName: ceo.name,
          sectorId: sector.id,
          sectorName: sector.name,
          path: ceo.path.join(' / '),
          connectedCables,
          reserveMeters: connectedCables.length * CEO_RESERVE_METERS_PER_CABLE,
        };
      })
      .filter((ceo) => ceo.connectedCables.length >= 2 || ceo.connectedCables.some((connection) => connection.connectionKind === 'ATRAVESSA'));
  });
}

function buildReserveMetersBySectorAndSize(ceoSangrias: CeoSangriaDebug[]): Record<string, Record<CableSize, number>> {
  const reserves: Record<string, Record<CableSize, number>> = {};

  ceoSangrias.forEach((ceo) => {
    const sectorReserve = reserves[ceo.sectorId] ?? emptyCableMeters();
    ceo.connectedCables.forEach((connection) => {
      const size = connection.cableType.match(/ASU\s+(\d+)/)?.[1]?.padStart(2, '0') as CableSize | undefined;
      if (size && CABLE_SIZES.includes(size)) sectorReserve[size] += CEO_RESERVE_METERS_PER_CABLE;
    });
    reserves[ceo.sectorId] = sectorReserve;
  });

  return reserves;
}

function buildCtoAsu06Terminations(
  sectors: SectorReport[],
  cableLines: CableLineDebug[],
): { terminations: CtoAsu06TerminationDebug[]; detectionLog: CtoAsu06DetectionDebug[] } {
  const detectionLog: CtoAsu06DetectionDebug[] = [];
  const terminations = sectors.flatMap((sector) => {
    const asu06Lines = cableLines.filter((line) => line.sectorId === sector.id && line.classifiedAs === 'CABO ASU 06 F.O');
    const ctos = sector.placemarks.filter((placemark) => isCtoPlacemark(placemark.name, placemark.path) && placemark.pointCoordinates.length > 0);
    const bestByPair = new Map<string, CtoAsu06TerminationDebug>();

    ctos.forEach((cto) => {
      cto.pointCoordinates.forEach((ctoPoint) => {
        asu06Lines.forEach((line) => {
          const hit = ctoToAsu06LineHit(ctoPoint, line.coordinates);
          if (!hit || hit.distanceMeters > CTO_TERMINATION_TOLERANCE_METERS) return;

          const pairKey = buildCtoCablePairKey(sector.id, cto.name, line.id);
          const candidate: CtoAsu06TerminationDebug = {
            ctoId: cto.id,
            ctoName: cto.name,
            sectorId: sector.id,
            sectorName: sector.name,
            cableLineId: line.id,
            cableName: line.originalName,
            type: hit.connectionKind === 'INICIO' || hit.connectionKind === 'FIM' ? 'FINAL' : 'PASSANTE',
            connectionKind: hit.connectionKind,
            distanceMeters: round(hit.distanceMeters),
            reserveMeters: CTO_RESERVE_METERS_ASU06,
          };
          const current = bestByPair.get(pairKey);
          const shouldReplace =
            !current ||
            candidate.distanceMeters < current.distanceMeters ||
            (candidate.type === 'FINAL' && current.type !== 'FINAL');

          detectionLog.push({
            lineId: line.id,
            lineName: line.originalName,
            segmentIndex: hit.segmentIndex,
            ctoId: cto.id,
            ctoName: cto.name,
            detectedType: candidate.type,
            connectionKind: candidate.connectionKind,
            distanceMeters: candidate.distanceMeters,
            intersectionPoint: hit.intersectionPoint,
            duplicateIgnored: !shouldReplace,
          });

          if (shouldReplace) {
            if (current) {
              for (let index = detectionLog.length - 1; index >= 0; index -= 1) {
                const entry = detectionLog[index];
                if (entry.lineId === line.id && normalizeName(entry.ctoName) === normalizeName(cto.name) && !entry.duplicateIgnored) {
                  entry.duplicateIgnored = true;
                  break;
                }
              }
            }
            bestByPair.set(pairKey, candidate);
          }
        });
      });
    });

    return Array.from(bestByPair.values());
  });

  return { terminations, detectionLog };
}

function buildCtoAsu06ReserveBySector(terminations: CtoAsu06TerminationDebug[]): Record<string, number> {
  return terminations.reduce<Record<string, number>>((totals, termination) => {
    totals[termination.sectorId] = (totals[termination.sectorId] ?? 0) + termination.reserveMeters;
    return totals;
  }, {});
}

function buildCtoCablePairKey(sectorId: string, ctoName: string, cableLineId: string): string {
  return `${sectorId}::${cableLineId}::${normalizeCtoKey(ctoName)}`;
}

function normalizeCtoKey(ctoName: string): string {
  return normalizeName(ctoName).replace(/[^A-Z0-9]+/g, '');
}

function ctoToAsu06LineHit(
  ctoPoint: Coordinate,
  lineString: Coordinate[],
): {
  connectionKind: 'INICIO' | 'FIM' | 'ATRAVESSA' | 'TOCA';
  distanceMeters: number;
  segmentIndex: number;
  intersectionPoint: Coordinate;
} | undefined {
  if (lineString.length < 2) return undefined;

  const startDistance = haversineMeters(ctoPoint, lineString[0]);
  const endDistance = haversineMeters(ctoPoint, lineString[lineString.length - 1]);
  let lineHit = {
    ...pointToSegmentHit(ctoPoint, lineString[0], lineString[1]),
    segmentIndex: 0,
  };

  for (let index = 2; index < lineString.length; index += 1) {
    const candidate = {
      ...pointToSegmentHit(ctoPoint, lineString[index - 1], lineString[index]),
      segmentIndex: index - 1,
    };
    if (candidate.distanceMeters < lineHit.distanceMeters) lineHit = candidate;
  }

  const endpointHit =
    startDistance <= endDistance
      ? { connectionKind: 'INICIO' as const, distanceMeters: startDistance, segmentIndex: 0, intersectionPoint: lineString[0] }
      : {
          connectionKind: 'FIM' as const,
          distanceMeters: endDistance,
          segmentIndex: lineString.length - 2,
          intersectionPoint: lineString[lineString.length - 1],
        };

  return endpointHit.distanceMeters <= lineHit.distanceMeters ? endpointHit : lineHit;
}

function pointToLineStringHit(point: Coordinate, lineString: Coordinate[]): { distanceMeters: number; connectionKind: 'INICIO' | 'FIM' | 'ATRAVESSA' | 'TOCA' } {
  let best = { distanceMeters: Number.POSITIVE_INFINITY, connectionKind: 'TOCA' as 'INICIO' | 'FIM' | 'ATRAVESSA' | 'TOCA' };

  lineString.forEach((coordinate, index) => {
    const endpointDistance = haversineMeters(point, coordinate);
    if (endpointDistance < best.distanceMeters) {
      best = {
        distanceMeters: endpointDistance,
        connectionKind: index === 0 ? 'INICIO' : index === lineString.length - 1 ? 'FIM' : 'TOCA',
      };
    }
  });

  for (let index = 1; index < lineString.length; index += 1) {
    const hit = pointToSegmentHit(point, lineString[index - 1], lineString[index]);
    if (hit.distanceMeters < best.distanceMeters) best = hit;
  }

  return best;
}

function pointToSegmentHit(
  point: Coordinate,
  start: Coordinate,
  end: Coordinate,
): { distanceMeters: number; connectionKind: 'ATRAVESSA' | 'TOCA'; intersectionPoint: Coordinate } {
  const originLat = point[1] * (Math.PI / 180);
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos(originLat);
  const px = 0;
  const py = 0;
  const ax = (start[0] - point[0]) * metersPerDegreeLon;
  const ay = (start[1] - point[1]) * metersPerDegreeLat;
  const bx = (end[0] - point[0]) * metersPerDegreeLon;
  const by = (end[1] - point[1]) * metersPerDegreeLat;
  const abx = bx - ax;
  const aby = by - ay;
  const abLengthSquared = abx * abx + aby * aby;

  if (abLengthSquared === 0) {
    return { distanceMeters: Math.hypot(ax - px, ay - py), connectionKind: 'TOCA', intersectionPoint: start };
  }

  const projection = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / abLengthSquared));
  const closestX = ax + projection * abx;
  const closestY = ay + projection * aby;
  return {
    distanceMeters: Math.hypot(closestX - px, closestY - py),
    connectionKind: projection > 0.05 && projection < 0.95 ? 'ATRAVESSA' : 'TOCA',
    intersectionPoint: [point[0] + closestX / metersPerDegreeLon, point[1] + closestY / metersPerDegreeLat],
  };
}

function buildSectorContext(sector: SectorReport, cableDebug: CableDebugInfo): SectorContext {
  const cableMetersBySize = CABLE_SIZES.reduce(
    (accumulator, size) => ({ ...accumulator, [size]: 0 }),
    {} as Record<CableSize, number>,
  );

  cableDebug.classifiedLines
    .filter((line) => line.sectorId === sector.id && line.classifiedAs)
    .forEach((line) => {
      const size = line.classifiedAs!.match(/ASU\s+(\d+)/)?.[1]?.padStart(2, '0') as CableSize | undefined;
      if (size && CABLE_SIZES.includes(size)) cableMetersBySize[size] += line.meters;
    });

  const reserveMetersBySize = cableDebug.reserveMetersBySectorAndSize[sector.id] ?? emptyCableMeters();
  const asu06CtoReserveMeters = cableDebug.ctoAsu06ReserveBySector[sector.id] ?? 0;

  CABLE_SIZES.forEach((size) => {
    const ctoReserve = size === '06' ? asu06CtoReserveMeters : 0;
    cableMetersBySize[size] = round(cableMetersBySize[size] + reserveMetersBySize[size] + ctoReserve);
  });

  const unclassifiedCableMetersBySector = {
    [sector.id]: round(
      cableDebug.unclassifiedLines
        .filter((line) => line.sectorId === sector.id)
        .reduce((total, line) => total + line.meters, 0),
    ),
  };
  const applicableCableMeters = CABLE_SIZES.reduce((total, size) => total + cableMetersBySize[size], 0);
  return {
    postes: countMatchingPoints(sector, (_text, path) => pathHasExact(path, 'POSTES')),
    ceo: getCeoSourceItems(sector).reduce((total, item) => total + item.quantity, 0),
    cto: getCtoSourceItems(sector).reduce((total, item) => total + item.quantity, 0),
    applicableCableMeters: round(applicableCableMeters),
    cordoalhaMeters: sumLineMeters(sector, (_text, path) => pathHasExact(path, 'CORDOALHAS')),
    cableMetersBySize,
    asu06LinearMeters: round(cableMetersBySize['06'] - reserveMetersBySize['06'] - asu06CtoReserveMeters),
    asu06CtoReserveMeters,
    asu06CtoTerminations: cableDebug.ctoAsu06Terminations.filter((item) => item.sectorId === sector.id).length,
    unclassifiedCableMetersBySector,
  };
}

function detectCableSize(text: string): CableSize | undefined {
  const normalized = normalizeCableText(text);
  const patterns: Record<CableSize, RegExp> = {
    '06': /\b(ASU\s*0?6|CABO\s*0?6|0?6\s*(FO|FIBRA|FIBRAS))\b/,
    '12': /\b(ASU\s*12|CABO\s*12|12\s*(FO|FIBRA|FIBRAS))\b/,
    '24': /\b(ASU\s*24|CABO\s*24|24\s*(FO|FIBRA|FIBRAS))\b/,
    '36': /\b(ASU\s*36|CABO\s*36|36\s*(FO|FIBRA|FIBRAS))\b/,
    '72': /\b(ASU\s*72|CABO\s*72|72\s*(FO|FIBRA|FIBRAS))\b/,
    '144': /\b(ASU\s*144|CABO\s*144|144\s*(FO|FIBRA|FIBRAS))\b/,
  };

  return CABLE_SIZES.find((size) => patterns[size].test(normalized));
}

function isCableFolderPath(path: string[]): boolean {
  const normalizedPath = path.map(normalizeName);
  return (
    CABLE_FOLDER_NAMES.some((folderName) => normalizedPath.includes(folderName)) ||
    normalizedPath.some((part) => /\b(REDE|FIBRA|ASU|DROP|CABO|CABOS|RAMAL|RAMAIS)\b/.test(part))
  );
}

function isCeoPlacemark(name: string, path: string[]): boolean {
  const text = searchableText(name, path);
  return pathHasExact(path, 'CEO') || hasWord(text, 'CEO') || hasWord(text, 'DISTRIBUICAO');
}

function isCtoPlacemark(name: string, path: string[]): boolean {
  const text = searchableText(name, path);
  return pathHasExact(path, 'CTO') || hasWord(text, 'CTO') || hasWord(text, 'ATENDIMENTO') || hasWord(text, 'TERMINAIS');
}

function emptyCableMeters(): Record<CableSize, number> {
  return {
    '06': 0,
    '12': 0,
    '24': 0,
    '36': 0,
    '72': 0,
    '144': 0,
  };
}

function countOlhaisForCableSizes(sector: SectorReport, sizes: CableSize[]): number {
  return countMatchingPoints(
    sector,
    (text) => hasWord(text, 'OLHAL') && sizes.some((size) => hasCableSize(text, size)),
  );
}

function countMatchingPoints(sector: SectorReport, predicate: (text: string, path: string[]) => boolean): number {
  return sector.placemarks.reduce((total, placemark) => {
    const text = searchableText(placemark.name, placemark.path);
    if (!predicate(text, placemark.path)) return total;
    return total + (placemark.pointCount > 0 ? placemark.pointCount : 1);
  }, 0);
}

function sumLineMeters(sector: SectorReport, predicate: (text: string, path: string[]) => boolean): number {
  const total = sector.placemarks.reduce((sum, placemark) => {
    if (placemark.lengthMeters <= 0) return sum;
    const text = searchableText(placemark.name, placemark.path);
    return predicate(text, placemark.path) ? sum + placemark.lengthMeters : sum;
  }, 0);

  return round(total);
}

function buildTotals(rows: MaterialEstimateRow[]) {
  const totals = new Map<string, { material: string; unit: MaterialUnit; category: MaterialCategory; total: number; bySector: Record<string, number> }>();

  rows.forEach((row) => {
    const current = totals.get(row.material) ?? {
      material: row.material,
      unit: row.unit,
      category: row.category,
      total: 0,
      bySector: {},
    };
    current.total += row.quantity;
    current.bySector[row.sectorName] = (current.bySector[row.sectorName] ?? 0) + row.quantity;
    totals.set(row.material, current);
  });

  return Array.from(totals.values()).map((total) => ({
    ...total,
    total: roundPhysical(total.total, total.unit),
  }));
}

function buildMaterialSourceItems(sectors: SectorReport[]): MaterialSourceItem[] {
  return sectors.flatMap((sector) => [...getCeoSourceItems(sector), ...getCtoSourceItems(sector), ...getPosteSourceItems(sector), ...getOlhalSourceItems(sector)]);
}

function getCeoSourceItems(sector: SectorReport): MaterialSourceItem[] {
  return sector.placemarks
    .filter((placemark) => {
      if (placemark.pointCount <= 0) return false;
      if (/96\s*\/?\s*144/i.test(placemark.name)) return false;
      return placemark.semanticCategory === 'CEO';
    })
    .map((placemark) => ({
      id: placemark.id,
      sectorId: sector.id,
      sectorName: sector.name,
      originalName: placemark.name,
      description: placemark.description,
      material: 'CEO',
      category: 'CEO' as const,
      geometryType: 'POINT' as const,
      originFolder: placemark.path[placemark.path.length - 1] ?? sector.name,
      quantity: placemark.pointCount,
    }));
}

function getCtoSourceItems(sector: SectorReport): MaterialSourceItem[] {
  return sector.placemarks
    .filter((placemark) => {
      if (placemark.pointCount <= 0) return false;
      return placemark.semanticCategory === 'CTO' || isCtoContextPath(placemark.path);
    })
    .map((placemark) => ({
      id: placemark.id,
      sectorId: sector.id,
      sectorName: sector.name,
      originalName: placemark.name,
      description: placemark.description,
      material: 'CTO',
      category: 'CTO' as const,
      geometryType: 'POINT' as const,
      originFolder: placemark.path[placemark.path.length - 1] ?? sector.name,
      quantity: placemark.pointCount,
    }));
}

function isCtoContextPath(path: string[]): boolean {
  return path.some((part) => {
    const normalized = normalizeName(part);
    return /\bCTOS?\b/.test(normalized) || /\bCAIXA\s+CTO\b/.test(normalized) || /\bTERMINAIS\b/.test(normalized) || /\bATENDIMENTO\b/.test(normalized);
  });
}

function getPosteSourceItems(sector: SectorReport): MaterialSourceItem[] {
  return sector.placemarks
    .filter((placemark) => {
      if (placemark.pointCount <= 0) return false;
      const text = searchableTextWithDescription(placemark.name, placemark.description, placemark.path);
      return placemark.semanticCategory === 'POSTES' || pathHasExact(placemark.path, 'POSTES') || hasWord(text, 'POSTE');
    })
    .map((placemark) => ({
      id: placemark.id,
      sectorId: sector.id,
      sectorName: sector.name,
      originalName: placemark.name,
      description: placemark.description,
      material: 'POSTES',
      category: 'POSTES' as const,
      geometryType: 'POINT' as const,
      originFolder: placemark.path[placemark.path.length - 1] ?? sector.name,
      quantity: placemark.pointCount,
    }));
}

function getOlhalSourceItems(sector: SectorReport): MaterialSourceItem[] {
  return sector.placemarks
    .filter((placemark) => {
      if (placemark.pointCount <= 0) return false;
      const text = searchableTextWithDescription(placemark.name, placemark.description, placemark.path);
      return hasWord(text, 'OLHAL');
    })
    .map((placemark) => ({
      id: placemark.id,
      sectorId: sector.id,
      sectorName: sector.name,
      originalName: placemark.name,
      description: placemark.description,
      material: 'OLHAL',
      category: 'OLHAL' as const,
      geometryType: 'POINT' as const,
      originFolder: placemark.path[placemark.path.length - 1] ?? sector.name,
      quantity: placemark.pointCount,
    }));
}

function searchableText(name: string, path: string[]): string {
  return normalizeName([...path, name].join(' '));
}

function searchableTextWithDescription(name: string, description: string | undefined, path: string[]): string {
  return normalizeName([...path, name, description ?? ''].join(' '));
}

function pathHasExact(path: string[], term: string): boolean {
  const normalizedTerm = normalizeName(term);
  return path.some((part) => normalizeName(part) === normalizedTerm);
}

function hasMaterialName(text: string, material: string): boolean {
  return hasTerms(text, normalizeName(material).split(/\s+/));
}

function hasTerms(text: string, terms: string[]): boolean {
  return terms.every((term) => hasWord(text, term));
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|\\W)${escapeRegExp(normalizeName(word))}(\\W|$)`).test(text);
}

function hasCableSize(text: string, size: string): boolean {
  const normalizedSize = size.replace(/^0/, '');
  return new RegExp(`(^|\\D)0?${escapeRegExp(normalizedSize)}(\\D|$)`).test(text);
}

function normalizeCableText(text: string): string {
  return normalizeName(text)
    .replace(/F\s*\.?\s*O/g, 'FO')
    .replace(/FIBRAS?/g, 'FIBRAS')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeName(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  return normalized.replace(/[./\\_-]+/g, ' ').replace(/\s+/g, ' ').replace(/\bC\s*T\s*O(S)?\b/g, 'CTO$1').replace(/\bC\s*E\s*O(S)?\b/g, 'CEO$1');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPhysical(value: number, unit: MaterialUnit): number {
  if (unit === 'METRO') return round(value);
  return Math.ceil(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
