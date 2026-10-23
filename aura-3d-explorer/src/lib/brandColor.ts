/**
 * Text colour for buttons filled with a company's accent colour. Companies pick
 * any colour, so white text is not always readable. Prefer white, then AURA
 * ink, when either reaches WCAG AA (4.5:1); mid-tones that neither reaches get
 * pure black or white, one of which always clears 4.5:1.
 */
const INK = "#1C1B19";
const WHITE = "#FFFFFF";
const BLACK = "#000000";
const AA = 4.5;

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A readable text colour on `accent` (a `#rrggbb` colour). */
export function brandTextColor(accent: string): string {
  if (contrastRatio(accent, WHITE) >= AA) return WHITE;
  if (contrastRatio(accent, INK) >= AA) return INK;
  return contrastRatio(accent, WHITE) >= contrastRatio(accent, BLACK) ? WHITE : BLACK;
}

/** Style for an accent-filled button: background plus readable text. */
export function brandButtonStyle(accent: string | null | undefined) {
  return accent && /^#[0-9a-f]{6}$/i.test(accent) ? { background: accent, color: brandTextColor(accent) } : undefined;
}

/** The accent for text on white paper (PDF/XLSX), or ink when the accent is too light to read. */
export function brandTextOnWhite(accent: string): string {
  return contrastRatio(accent, WHITE) >= AA ? accent : INK;
}
