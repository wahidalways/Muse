import type { MusicTrack } from '../types';

// No runtime imports, so scripts/check-stats.mjs can test this file.

export type LibrarySort =
  | 'title'
  | 'artist'
  | 'album'
  | 'albumArtist'
  | 'year'
  | 'trackNumber'
  | 'filename'
  | 'path'
  | 'duration'
  | 'dateAdded'
  | 'dateModified';
export type SortDirection = 'ascending' | 'descending';

/** What kind of value a sort orders by, which sets its order labels. */
export type SortKind = 'text' | 'number' | 'date' | 'duration' | 'count';

const SORT_KINDS: Record<LibrarySort, SortKind> = {
  title: 'text',
  artist: 'text',
  album: 'text',
  albumArtist: 'text',
  year: 'date',
  trackNumber: 'number',
  filename: 'text',
  path: 'text',
  duration: 'duration',
  dateAdded: 'date',
  dateModified: 'date',
};

/**
 * Direction labels that say what the order means for this sort, for example
 * "Newest first" for dates instead of "Descending".
 */
export function sortDirectionLabels(
  sortBy: LibrarySort,
): Record<SortDirection, string> {
  return directionLabelsFor(SORT_KINDS[sortBy]);
}

export function sortKindOf(sortBy: LibrarySort): SortKind {
  return SORT_KINDS[sortBy];
}

/** The order labels for any kind of sort, songs or albums and artists. */
export function directionLabelsFor(kind: SortKind): Record<SortDirection, string> {
  switch (kind) {
    case 'date':
      return { descending: 'Newest first', ascending: 'Oldest first' };
    case 'duration':
      return { ascending: 'Shortest first', descending: 'Longest first' };
    case 'number':
      return { ascending: 'Low to high', descending: 'High to low' };
    case 'count':
      return { descending: 'Most first', ascending: 'Fewest first' };
    default:
      return { ascending: 'A to Z', descending: 'Z to A' };
  }
}

/** The order a sort usually starts in: newest first for dates, else A to Z. */
export function defaultSortDirection(sortBy: LibrarySort): SortDirection {
  return defaultDirectionFor(SORT_KINDS[sortBy]);
}

/** Newest first for dates, most first for counts, otherwise A to Z or low to high. */
export function defaultDirectionFor(kind: SortKind): SortDirection {
  return kind === 'date' || kind === 'count' ? 'descending' : 'ascending';
}

// Created once: building a formatter is slow on Hermes.
const shortDateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "12 Mar 2024" from seconds since the epoch. */
export function formatShortDate(seconds: number): string {
  return shortDateFormat.format(new Date(seconds * 1000));
}

const keyCache = new Map<string, string>();

/**
 * A key that sorts with plain `<` the way people expect: no case, no accents
 * (É with E), and numbers by value ("Track 2" before "Track 10"). Hermes on
 * Android runs every Intl.Collator compare through Java, so a big library
 * took tens of thousands of slow calls per sort; keys are built once per
 * name and reused by every later sort.
 * shortcut: non-Latin scripts order by code point, not by language rules; use a collator per key if that matters.
 */
export function textSortKey(text: string): string {
  let key = keyCache.get(text);
  if (key === undefined) {
    // Plain ASCII needs no accent folding, which skips the slow normalize.
    const folded = /^[\x00-\x7f]*$/.test(text)
      ? text
      : text.normalize('NFD').replace(/\p{M}/gu, '');
    key = folded
      .toLowerCase()
      .trim()
      .replace(/\d+/g, (digits) => digits.replace(/^0+(?=\d)/, '').padStart(12, '0'));
    keyCache.set(text, key);
  }
  return key;
}

const compareKeys = (first: string, second: string) =>
  first < second ? -1 : first > second ? 1 : 0;

/**
 * Each song's sort value is read once, then the sort compares those. The
 * old comparator re-read and re-checked both songs' fields on every one of
 * the n log n comparisons, which adds up in a big library.
 */
export function sortMusicTracks(
  tracks: MusicTrack[],
  sortBy: LibrarySort,
  direction: SortDirection,
): MusicTrack[] {
  const sign = direction === 'ascending' ? 1 : -1;
  const decorated = tracks.map((track) => {
    const value = sortValue(track, sortBy);
    return {
      track,
      value: typeof value === 'string' ? textSortKey(value) : value,
      title: textSortKey(track.title),
    };
  });
  decorated.sort((first, second) => {
    // Songs without the value (no year, no artist...) always go last.
    if ((first.value === null) !== (second.value === null)) {
      return first.value === null ? 1 : -1;
    }
    const comparison =
      first.value === null || second.value === null
        ? 0
        : typeof first.value === 'string'
          ? compareKeys(first.value, second.value as string)
          : first.value - (second.value as number);
    if (comparison !== 0) {
      return sign * comparison;
    }
    // Equal values (same date, same artist...) keep a stable, readable
    // order: by title, then by path.
    return (
      compareKeys(first.title, second.title) || compareKeys(first.track.path, second.track.path)
    );
  });
  return decorated.map((entry) => entry.track);
}

function sortValue(track: MusicTrack, sortBy: LibrarySort): string | number | null {
  switch (sortBy) {
    case 'title':
      return track.title;
    case 'artist':
      return track.artist;
    case 'album':
      return track.album;
    case 'albumArtist':
      return track.albumArtist;
    case 'year':
      return track.year;
    case 'trackNumber':
      return track.trackNumber;
    case 'filename':
      return track.filename;
    case 'path':
      return track.path;
    case 'duration':
      return track.duration;
    case 'dateAdded':
      return track.dateAdded ?? null;
    case 'dateModified':
      // Caches from before date modified existed have no value at all.
      return track.dateModified ?? null;
  }
}
