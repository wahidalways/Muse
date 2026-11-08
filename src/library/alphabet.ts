/** The index letter for a name: A-Z, or # for numbers, symbols and blanks. */
export function indexLetter(text: string | null): string {
  // The same accent folding as search (normalizeSearch), so É files under E.
  const raw = (text ?? '').trim().charAt(0);
  // Only non-ASCII needs folding, and only its first character.
  const first = (raw < '\u0080' ? raw : raw.normalize('NFD').charAt(0)).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

/** Each letter's first position in `keys` (already sorted), in list order. */
export function letterPositions(keys: (string | null)[]): { letter: string; index: number }[] {
  const seen = new Set<string>();
  const positions: { letter: string; index: number }[] = [];
  keys.forEach((key, index) => {
    const letter = indexLetter(key);
    if (!seen.has(letter)) {
      seen.add(letter);
      positions.push({ letter, index });
    }
  });
  return positions;
}
