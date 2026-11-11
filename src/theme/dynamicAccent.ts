import type { Accent } from './theme';

/**
 * A cover's main hue (0-360) and how colorful it is (0 grey to 1 vivid).
 * Builds made after 2026-11-11 also measure the main color's saturation,
 * the cover's brightness (both 0-1) and a clearly different second hue.
 */
export type CoverColor = { hue: number; colorfulness: number; saturation?: number; lightness?: number; secondHue?: number };

/** Below this a cover is close to grey, black or white, and keeps the chosen accent. */
const MIN_COLORFULNESS = 0.12;

export function hueOf(hex: string): number {
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The full player's two background tones (Cover color wash): lighter on top,
 * deep at the bottom. With a measured cover they follow it: its main color on
 * top and its second color at the bottom; a vivid cover washes vivid, a muted
 * one soft, and a bright cover lifts the top. Lightness stays in the range
 * where the player's text and controls read in each theme. A hue alone (Muse
 * art, older builds) gives the fixed look from before.
 */
export function tintTones(
  color: Pick<CoverColor, 'hue' | 'saturation' | 'lightness' | 'secondHue'>,
  theme: 'light' | 'dark',
): [string, string] {
  const dark = theme === 'dark';
  const { saturation, lightness = 0.5, secondHue } = color;
  const hue = Math.round(color.hue) % 360;
  // Without a second color the top shifts a little, so the two tones still differ.
  const top = secondHue === undefined ? (hue + 14) % 360 : hue;
  const bottom = secondHue === undefined ? hue : Math.round(secondHue) % 360;
  const tone = (h: number, s: number, l: number) => `hsl(${h}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  if (saturation === undefined) {
    return dark ? [tone(top, 36, 27), tone(bottom, 30, 8)] : [tone(top, 52, 88), tone(bottom, 30, 79)];
  }
  return dark
    ? [
        tone(top, clamp(18 + 48 * saturation, 18, 60), clamp(21 + 12 * lightness, 21, 33)),
        tone(bottom, clamp(16 + 32 * saturation, 16, 44), secondHue === undefined ? 8 : 11),
      ]
    : [
        tone(top, clamp(30 + 46 * saturation, 30, 72), clamp(84 + 6 * lightness, 84, 90)),
        tone(bottom, clamp(18 + 30 * saturation, 18, 46), 79),
      ];
}
