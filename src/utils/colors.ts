const FALLBACK_COLOR = '#6B7280';

export function normalizeKmlColor(kmlColor?: string | null): string {
  if (!kmlColor) return FALLBACK_COLOR;

  const clean = kmlColor.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6,8}$/.test(clean)) return FALLBACK_COLOR;

  if (clean.length === 8) {
    const bb = clean.slice(2, 4);
    const gg = clean.slice(4, 6);
    const rr = clean.slice(6, 8);
    return `#${rr}${gg}${bb}`.toUpperCase();
  }

  return `#${clean}`.toUpperCase();
}

export function isFallbackColor(color: string): boolean {
  return color.toUpperCase() === FALLBACK_COLOR;
}
