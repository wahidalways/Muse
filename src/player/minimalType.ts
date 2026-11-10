/**
 * Minimal type sets the title as large as it can go: every word must fit on
 * one line and the whole title in three. Sizes come from one type scale, so a
 * short title is a poster and a long one still reads. Widths are a close
 * estimate for the system font's black weight at the tight tracking below.
 */
export const MINIMAL_TITLE_SIZES = [72, 56, 40, 32];
export const MINIMAL_TITLE_LINES = 3;
/** Average width of one letter, in ems, of the black weight with the tight tracking. */
const ADVANCE_EM = 0.58;

/** The title size for `width` (in points, already divided by the font scale), up to `maxSize`. */
export function minimalTitleSize(title: string, width: number, maxSize = MINIMAL_TITLE_SIZES[0]): number {
  const words = title.trim().split(/\s+/).filter(Boolean);
  for (const size of MINIMAL_TITLE_SIZES) {
    if (size > maxSize) {
      continue;
    }
    const perLine = Math.floor(width / (size * ADVANCE_EM));
    let lines = 1;
    let used = 0;
    let fits = true;
    for (const word of words) {
      if (word.length > perLine) {
        fits = false;
        break;
      }
      const next = used === 0 ? word.length : used + 1 + word.length;
      if (next > perLine) {
        lines += 1;
        used = word.length;
      } else {
        used = next;
      }
    }
    if (fits && lines <= MINIMAL_TITLE_LINES) {
      return size;
    }
  }
  return MINIMAL_TITLE_SIZES[MINIMAL_TITLE_SIZES.length - 1];
}

/** Tight leading and tracking that scale with the size, as display type does. */
export function minimalTitleStyle(size: number) {
  return { fontSize: size, lineHeight: Math.round(size * 1.02), letterSpacing: -size * 0.035 };
}

/** The small labels beside the cover: where the song is in the queue, then its genre and year. */
export function minimalLabels(
  track: { genre?: string | null; year?: number | string | null },
  position: number,
  count: number,
): [string, string] {
  return [
    count > 1 ? `SONG ${position + 1} OF ${count}` : '',
    [track.genre, track.year].filter(Boolean).join(' · ').toUpperCase(),
  ];
}
