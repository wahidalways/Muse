import type { Accent } from './theme';

/** A cover's main hue (0-360) and how colorful it is (0 grey to 1 vivid). */
export type CoverColor = { hue: number; colorfulness: number };

/** Below this a cover is close to grey, black or white, and keeps the chosen accent. */
const MIN_COLORFULNESS = 0.12;

function hueOf(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) {
    return 0;
  }
  const hue =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (hue * 60 + 360) % 360;
}

/**
 * The Muse accent closest in hue to a cover, so the app takes on the song's
 * color while keeping the accents' tested contrast in both themes. Grey or
 * missing covers keep `fallback`, the accent chosen in Settings.
 */
export function accentForCover(
  color: CoverColor | null,
  fallback: Accent,
  /** The accents to choose from (ACCENT_OPTIONS); passed in so it is testable. */
  accents: readonly { id: Accent; swatch: string }[],
): Accent {
  if (!color || color.colorfulness < MIN_COLORFULNESS) {
    return fallback;
  }
  let best = fallback;
  let bestDistance = Infinity;
  for (const accent of accents) {
    const gap = Math.abs(hueOf(accent.swatch) - color.hue) % 360;
    const distance = Math.min(gap, 360 - gap);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = accent.id;
    }
  }
  return best;
}
