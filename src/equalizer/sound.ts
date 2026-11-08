/**
 * The equalizer's sound: 10 band gains, a bass boost, and the values the
 * native effect takes. No runtime imports, so `scripts/check-eq.mjs` can test
 * it directly.
 */
import type { EffectsConfig } from '../../modules/muse-audio-metadata/effects';

export type Sound = {
  /** dB at each BANDS frequency. */
  gains: number[];
  /** dB added to the low end, 0 to BASS_BOOST_MAX. */
  bassBoost: number;
  /** The preset this came from; null once changed by hand ("Custom"). */
  presetName: string | null;
};

export const GAIN_RANGE = 12;
export const BASS_BOOST_MAX = 10;
export const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
/** How much of the bass boost each band gets: a gentle low shelf. */
const BASS_SHAPE = [1, 1, 0.6, 0.25, 0, 0, 0, 0, 0, 0];

/** Built-in presets: gains (dB) at BANDS. */
export const PRESETS: { name: string; gains: number[] }[] = [
  { name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Bass Booster', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { name: 'Bass Reducer', gains: [-6, -5, -4, -2, 0, 0, 0, 0, 0, 0] },
  { name: 'Treble Booster', gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  { name: 'Treble Reducer', gains: [0, 0, 0, 0, 0, -1, -2, -4, -5, -6] },
  { name: 'Vocal Booster', gains: [-2, -3, -3, 1, 3, 4, 4, 3, 1, 0] },
  { name: 'Spoken Word', gains: [-4, -3, -1, 1, 3, 4, 4, 3, 1, -1] },
  { name: 'Loudness', gains: [6, 4, 0, 0, -2, 0, -1, -4, 4, 1] },
  { name: 'Acoustic', gains: [4, 4, 3, 1, 2, 2, 3, 3, 3, 2] },
  { name: 'Classical', gains: [4, 3, 3, 2, -1, -1, 0, 2, 3, 4] },
  { name: 'Dance', gains: [4, 5, 2, 0, -2, 2, 1, 0, 4, 4] },
  { name: 'Deep', gains: [5, 4, 2, 1, 2, 1, -1, -2, -3, -4] },
  { name: 'Electronic', gains: [4, 4, 1, 0, -2, 2, 1, 1, 4, 5] },
  { name: 'Hip-Hop', gains: [5, 4, 1, 3, -1, -1, 1, -1, 2, 3] },
  { name: 'Jazz', gains: [4, 3, 1, 2, -2, -2, 0, 1, 3, 4] },
  { name: 'Piano', gains: [2, 1, 0, 2, 3, 1, 3, 4, 3, 3] },
  { name: 'Pop', gains: [-1, 1, 2, 4, 4, 2, 0, -1, -1, -1] },
  { name: 'R&B', gains: [3, 7, 6, 1, -2, -1, 2, 3, 3, 4] },
  { name: 'Rock', gains: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5] },
  { name: 'Small Speakers', gains: [-4, -1, 3, 3, 2, 1, 0, 0, 1, 0] },
];

export const DEFAULT_SOUND: Sound = {
  gains: BANDS.map(() => 0),
  bassBoost: 0,
  presetName: 'Flat',
};

/** Each band's gain with the bass boost added. */
export function shapedGains(sound: Sound): number[] {
  return sound.gains.map((gain, index) => gain + sound.bassBoost * BASS_SHAPE[index]);
}

/** Level drop that keeps the biggest boost from clipping (the crackle on loud parts). */
export function headroom(sound: Sound): number {
  return Math.max(0, ...shapedGains(sound));
}

// Each native band runs up to the midpoint (on a log scale) of its neighbour;
// the top one reaches past hearing so nothing is left out.
const CUTOFFS = [...BANDS.slice(1).map((freq, index) => Math.round(Math.sqrt(freq * BANDS[index]))), 24000];

/** The native effect values. `enabled` false removes the effect entirely. */
export function buildEffects(sound: Sound, enabled: boolean): EffectsConfig {
  const drop = headroom(sound);
  return {
    enabled,
    cutoffs: CUTOFFS,
    gains: shapedGains(sound).map((gain) => Math.round((gain - drop) * 100) / 100),
  };
}

export function withPreset(sound: Sound, preset: { name: string; gains: number[] }): Sound {
  return { ...sound, gains: [...preset.gains], presetName: preset.name };
}

/** "+3.0 dB", "−1.5 dB", "0 dB". */
export function formatDb(db: number, digits = 1): string {
  const value = Math.round(db * 10 ** digits) / 10 ** digits;
  if (value === 0) return '0 dB';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)} dB`;
}

/** Short band label under a slider: "31", "1k", "16k". */
export function shortFreq(freq: number): string {
  return freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
}

const num = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/**
 * A saved sound, or null. Also reads the older, bigger equalizer's saves:
 * its 10-band gains carry over, the rest is dropped.
 */
export function parseSound(value: unknown): Sound | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const saved = value as Record<string, unknown>;
  const list = Array.isArray(saved.gains) ? saved.gains : Array.isArray(saved.graphic10) ? saved.graphic10 : [];
  return {
    gains: BANDS.map((_, index) => num(list[index], 0, -GAIN_RANGE, GAIN_RANGE)),
    bassBoost: num(saved.bassBoost, 0, 0, BASS_BOOST_MAX),
    presetName: typeof saved.presetName === 'string' ? saved.presetName : null,
  };
}
