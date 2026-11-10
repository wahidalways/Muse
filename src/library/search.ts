import type { MusicFolder, MusicTrack } from '../types';
import type { TrackGroup } from './browse';
import type { Playlist } from './playlists';

/**
 * Search across the whole library. Pure functions with no runtime imports,
 * so `scripts/check-stats.mjs` can test them. Groups come in already built,
 * because the screen keeps them between keystrokes.
 */

export type SearchSource = {
  tracks: MusicTrack[];
  artists: TrackGroup[];
  albums: TrackGroup[];
  genres: TrackGroup[];
  playlists: Playlist[];
  folders: MusicFolder[];
};

export type TopResult =
  | { kind: 'artist'; group: TrackGroup }
  | { kind: 'album'; group: TrackGroup }
  | { kind: 'playlist'; playlist: Playlist }
  | { kind: 'song'; track: MusicTrack };

export type SearchResults = {
  top: TopResult | null;
  songs: MusicTrack[];
  artists: TrackGroup[];
  albums: TrackGroup[];
  playlists: Playlist[];
  genres: TrackGroup[];
  folders: MusicFolder[];
};

/** Lower case, without accents, so "beyonce" finds "Beyoncé". */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
}

/** A search split into normalized words: "  Beyoncé  Halo " is ["beyonce", "halo"]. */
export function searchWords(text: string): string[] {
  return normalizeSearch(text).split(/\s+/).filter(Boolean);
}

/**
 * Whether every word turns up somewhere in `haystack` (already normalized).
 * The words can sit in different fields, so "drake views" finds the album
 * Views by Drake, which one whole-phrase match would miss.
 */
export function matchesAllWords(haystack: string, words: string[]): boolean {
  return words.every((word) => hasWord(haystack, word));
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
/** Words this short must start a word: "ar" finds "Arthur", not "Heart". */
const MIN_INSIDE_WORD = 3;

function startsWord(text: string, at: number): boolean {
  return at === 0 || !LETTER_OR_DIGIT.test(text[at - 1]);
}

/** Where `word` matches in `text` (both normalized), by the rule above. */
function wordMatches(text: string, word: string): number[] {
  const found: number[] = [];
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    if (word.length >= MIN_INSIDE_WORD || startsWord(text, at)) {
      found.push(at);
    }
  }
  return found;
}

function hasWord(text: string, word: string): boolean {
  return wordMatches(text, word).length > 0;
}

/**
 * The parts of `text` (as shown, with its accents and capitals) that the
 * search words match, as merged [start, end) ranges, for highlighting.
 * "Beyoncé" with ["beyonce"] gives [[0, 7]].
 */
export function matchRanges(text: string, words: string[]): [number, number][] {
  if (!text || words.length === 0) {
    return [];
  }
  // Fold one character at a time, remembering where each folded character
  // came from, since dropping accents can change the length.
  let folded = '';
  const origin: number[] = [];
  for (let index = 0; index < text.length; ) {
    const character = String.fromCodePoint(text.codePointAt(index) ?? 0);
    for (const piece of character.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()) {
      folded += piece;
      for (let unit = 0; unit < piece.length; unit += 1) {
        origin.push(index);
      }
    }
    index += character.length;
  }
  const ranges: [number, number][] = [];
  for (const word of words) {
    for (const at of wordMatches(folded, word)) {
      const last = origin[at + word.length - 1];
      const lastLength = String.fromCodePoint(text.codePointAt(last) ?? 0).length;
      ranges.push([origin[at], last + lastLength]);
    }
  }
  ranges.sort((first, second) => first[0] - second[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range[0] <= previous[1]) {
      previous[1] = Math.max(previous[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }
  return merged;
}

const withoutExtension = (filename: string) => filename.replace(/\.[^/.]+$/, '');

/**
 * Lower-cased, accent-free text for each track that search matches against.
 * No folder path and no file extension: nearly every song sits under a
 * "Music/" path and ends in ".mp3", so "mus" or "mp3" matched the whole
 * library. The folder's own name stays.
 */
export function buildSearchIndex(tracks: MusicTrack[]): Map<string, string> {
  return new Map(
    tracks.map((track) => [
      track.id,
      // Same folding as the Search tab, so "beyonce" finds Beyoncé.
      normalizeSearch(
        [
          track.title,
          track.artist,
          track.album,
          track.albumArtist,
          withoutExtension(track.filename),
          track.folderTitle,
        ]
          .filter((value): value is string => value !== null)
          .join('\n'),
      ),
    ]),
  );
}

/**
 * When some search word matches only a field a song row does not show, that
 * field, so the row can say why it is there ("Folder: Downloads"). Null when
 * the title and the "Artist · Album" line already explain the match.
 */
export function hiddenMatch(
  track: MusicTrack,
  words: string[],
): { label: string; value: string } | null {
  // The row shows the title and artist and album, or the folder if untagged.
  const tagged = [track.artist, track.album].filter((value): value is string => Boolean(value));
  const visible = normalizeSearch(
    [track.title, ...(tagged.length > 0 ? tagged : [track.folderTitle])].join('\n'),
  );
  const unexplained = words.filter((word) => !hasWord(visible, word));
  if (unexplained.length === 0) {
    return null;
  }
  const hidden: [string, string | null][] = [
    ['Album artist', track.albumArtist],
    ['File', withoutExtension(track.filename)],
    ['Folder', track.folderTitle],
  ];
  for (const [label, value] of hidden) {
    if (value && unexplained.some((word) => hasWord(normalizeSearch(value), word))) {
      return { label, value };
    }
  }
  return null;
}

/**
 * Each text normalized once and split into words. Every keystroke scores the
 * same titles, artists and albums again, and normalizing (NFD plus a Unicode
 * regex) was most of the work. Grows with the library's distinct texts only.
 */
const prepared = new Map<string, { value: string; words: string[] }>();
function prepare(text: string) {
  let entry = prepared.get(text);
  if (!entry) {
    const value = normalizeSearch(text);
    entry = { value, words: value.split(/[^\p{L}\p{N}]+/u) };
    prepared.set(text, entry);
  }
  return entry;
}

/** 4 exact, 3 starts with, 2 a word starts with, 1 contains, 0 no match. */
export function matchScore(text: string | null, query: string): number {
  if (!text || !query) {
    return 0;
  }
  const { value, words } = prepare(text);
  if (value === query) return 4;
  if (value.startsWith(query)) return 3;
  if (words.some((word) => word.startsWith(query))) return 2;
  return value.includes(query) ? 1 : 0;
}

function rank<T>(items: T[], score: (item: T) => number, name: (item: T) => string, limit: number) {
  // Ties in name order, compared on the normalized text: localeCompare goes
  // through Intl on Hermes, and a one-letter search can tie thousands.
  const byName = (first: T, second: T) => {
    const a = prepare(name(first)).value;
    const b = prepare(name(second)).value;
    return a < b ? -1 : a > b ? 1 : 0;
  };
  return items
    .map((item) => ({ item, score: score(item) }))
    .filter((hit) => hit.score > 0)
    .sort((first, second) => second.score - first.score || byName(first.item, second.item))
    .slice(0, limit);
}

/** Untagged songs gather under an empty key ("Unknown artist"), never a result. */
const groupScore = (query: string) => (group: TrackGroup) =>
  group.key === '' ? 0 : matchScore(group.title, query);

export const EMPTY_RESULTS: SearchResults = {
  top: null,
  songs: [],
  artists: [],
  albums: [],
  playlists: [],
  genres: [],
  folders: [],
};

export function searchLibrary(text: string, source: SearchSource): SearchResults {
  const query = normalizeSearch(text);
  if (!query) {
    return EMPTY_RESULTS;
  }
  // A song also turns up when its artist or album matches, ranked lower.
  const songs = rank(
    source.tracks,
    (track) =>
      Math.max(
        matchScore(track.title, query),
        matchScore(track.artist, query) * 0.8,
        matchScore(track.album, query) * 0.6,
        matchScore(track.filename, query) * 0.5,
      ),
    (track) => track.title,
    50,
  );
  const artists = rank(source.artists, groupScore(query), (group) => group.title, 8);
  const albums = rank(
    source.albums,
    (group) => Math.max(groupScore(query)(group), matchScore(group.subtitle, query) * 0.7),
    (group) => group.title,
    8,
  );
  const playlists = rank(source.playlists, (list) => matchScore(list.name, query), (list) => list.name, 8);
  const genres = rank(source.genres, groupScore(query), (group) => group.title, 8);
  const folders = rank(source.folders, (folder) => matchScore(folder.title, query), (folder) => folder.title, 8);

  // The best match of all. On a tie, the earlier kind wins: an artist is a
  // better first answer than one of their songs.
  const candidates: { score: number; result: TopResult }[] = [];
  if (artists[0]) candidates.push({ score: artists[0].score, result: { kind: 'artist', group: artists[0].item } });
  if (albums[0]) candidates.push({ score: albums[0].score, result: { kind: 'album', group: albums[0].item } });
  if (playlists[0]) candidates.push({ score: playlists[0].score, result: { kind: 'playlist', playlist: playlists[0].item } });
  if (songs[0]) candidates.push({ score: songs[0].score, result: { kind: 'song', track: songs[0].item } });
  const best = candidates.reduce<(typeof candidates)[number] | null>(
    (winner, candidate) => (!winner || candidate.score > winner.score ? candidate : winner),
    null,
  );

  return {
    top: best?.result ?? null,
    songs: songs.map((hit) => hit.item),
    artists: artists.map((hit) => hit.item),
    albums: albums.map((hit) => hit.item),
    playlists: playlists.map((hit) => hit.item),
    genres: genres.map((hit) => hit.item),
    folders: folders.map((hit) => hit.item),
  };
}
