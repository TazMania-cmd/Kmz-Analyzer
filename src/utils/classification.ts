import { SemanticClassification } from '../types/kmz';

const CATEGORY_PATTERNS: Array<{ classification: SemanticClassification; patterns: RegExp[] }> = [
  { classification: 'POSTES', patterns: [/\bPOSTE(S)?\b/, /\bPONTOS?\b/, /\bPONTOS?\s+POSTE(S)?\b/, /\bPOSTEACAO\b/] },
  { classification: 'CTO', patterns: [/\bCTO(S)?\b/, /\bCAIXA\s+CTO\b/, /\bTERMINAIS\b/, /\bATENDIMENTO\b/] },
  { classification: 'CEO', patterns: [/\bCEO(S)?\b/, /\bCEO\s+SANGRIA\b/, /\bCAIXA\s+CEO\b/, /\bDISTRIBUICAO\b/] },
  { classification: 'BACKBONE', patterns: [/\bBACKBONE\b/] },
  { classification: 'RAMAIS', patterns: [/\bRAMAIS\b/, /\bRAMAL\b/, /\bDROP\b/] },
  { classification: 'CABOS', patterns: [/\bCABO(S)?\b/, /\bREDE\b/, /\bFIBRA\b/, /\bASU\b/] },
  { classification: 'CORDOALHAS', patterns: [/\bCORDOALHA(S)?\b/, /\bSUSTENTACAO\b/, /\bMENSAGEIRO\b/] },
  { classification: 'AREA', patterns: [/\bAREA\s+A\s+CABEAR\b/, /\bAREA\s+DE\s+ATENDIMENTO\b/, /\bPOLIGONO\b/, /\bPOLYGON\b/] },
  { classification: 'ESTIMATIVA', patterns: [/\bESTIMATIVA\b/, /\bMATERIAL\b/, /\bORCAMENTO\b/] },
];

export function normalizeText(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[./\\_-]+/g, ' ')
    .replace(/[^A-Z/a-z/0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  return normalized.replace(/\bC\s*T\s*O(S)?\b/g, 'CTO$1').replace(/\bC\s*E\s*O(S)?\b/g, 'CEO$1');
}

export function detectSectorName(path: string[]): string {
  const candidates = path.map(normalizeText);
  const sector = candidates.find((item) => /\bM\d+\s*\/\s*M\d+\b/.test(item)) ?? candidates.find((item) => /\bM\d+\b/.test(item));
  const area = candidates.find((item) => /\bAREA\s*\d+\b/.test(item));
  const setor = candidates.find((item) => /\bSETOR\s*\d+\b/.test(item));

  return sector ?? area ?? setor ?? 'SETOR NAO CLASSIFICADO';
}

export function isSectorFolderName(name: string): boolean {
  const normalized = normalizeText(name);
  return /\bM\d+\s*\/\s*M\d+\b/.test(normalized) || /\bM\d+\b/.test(normalized) || /\bAREA\s*\d+\b/.test(normalized) || /\bSETOR\s*\d+\b/.test(normalized);
}

export function classifyText(value: string): SemanticClassification {
  const normalized = normalizeText(value);
  const found = CATEGORY_PATTERNS.find((entry) => entry.patterns.some((pattern) => pattern.test(normalized)));
  return found?.classification ?? 'NAO CLASSIFICADO';
}

export function classifyPath(path: string[], elementName = ''): SemanticClassification {
  const ordered = [...path, elementName].filter(Boolean).reverse();
  for (const item of ordered) {
    const classification = classifyText(item);
    if (classification !== 'NAO CLASSIFICADO') return classification;
  }
  return 'NAO CLASSIFICADO';
}

export function classificationToReportCategory(classification: SemanticClassification) {
  if (classification === 'AREA') return 'AREA X CABEAR';
  if (classification === 'NAO CLASSIFICADO') return 'OUTROS';
  if (classification === 'SETOR') return 'OUTROS';
  return classification;
}
