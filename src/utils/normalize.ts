import type { CountType } from '../types';
import type { CableType } from '../types';

const EXACT_FOLDER_TYPES: Record<string, CountType | 'CABOS'> = {
  CTO: 'CTO',
  CTOS: 'CTO',
  CEO: 'CEO',
  CEOS: 'CEO',
  POSTE: 'POSTES',
  POSTES: 'POSTES',
  RAMAL: 'RAMAIS',
  RAMAIS: 'RAMAIS',
  BACKBONE: 'BACKBONE',
  BACKBONES: 'BACKBONE',
  CORDOALHA: 'CORDOALHAS',
  CORDOALHAS: 'CORDOALHAS',
  CABO: 'CABOS',
  CABOS: 'CABOS',
};

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyExactFolder(name: string): CountType | 'CABOS' | undefined {
  return EXACT_FOLDER_TYPES[normalizeName(name)];
}

export function isProjectRootName(name: string): boolean {
  const normalized = normalizeName(name);
  return normalized === 'PROJETO' || normalized === 'PROJECT' || normalized === 'DOCUMENT';
}

export function identifyCableType(value: string): CableType | undefined {
  const normalized = normalizeName(value);
  const compact = normalized.replace(/\s+/g, ' ');
  const match = compact.match(/(?:^|\s)(?:CABO\s*)?(06|6|12|24|36|72|144)(?:\s*(?:F\s*O|FO))?(?:\s|$)/);
  if (!match) return undefined;

  const fiberCount = match[1] === '6' ? '06' : match[1].padStart(2, '0');
  if (fiberCount === '06') return 'CABO 06 F.O';
  if (fiberCount === '12') return 'CABO 12 F.O';
  if (fiberCount === '24') return 'CABO 24 F.O';
  if (fiberCount === '36') return 'CABO 36 F.O';
  if (fiberCount === '72') return 'CABO 72 F.O';
  if (fiberCount === '144') return 'CABO 144 F.O';
  return undefined;
}
