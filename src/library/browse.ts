import type { ListeningEvent, MusicTrack } from '../types';
// With .ts, so scripts/check-stats.mjs (plain Node) can load it too; Metro takes the exact path.
import { textSortKey, type SortDirection } from './sortTracks.ts';

/**
 * Ways to browse the library in the More tab. Pure functions with no runtime
 * imports, so `scripts/check-stats.mjs` can test them.
 */

export type GroupKind = 'album' | 'artist' | 'albumArtist' | 'genre' | 'year';

export type TrackGroup = {
  key: string;
  title: string;
  subtitle: string | null;
  tracks: MusicTrack[];
};

const UNKNOWN: Record<GroupKind, string> = {
  album: 'Unknown album',
  artist: 'Unknown artist',
  albumArtist: 'Unknown album artist',
  genre: 'No genre',
  year: 'Unknown year',
};

/** The key `groupTracks` gives `track`'s group, to open that group's page. */
export function groupKeyFor(track: MusicTrack, kind: GroupKind): string {
  const value = groupValue(track, kind);
  const albumBy = kind === 'album' ? track.albumArtist ?? track.artist : null;
  return value === null ? '' : `${value}\u0000${albumBy ?? ''}`;
}

function groupValue(track: MusicTrack, kind: GroupKind): string | null {
  switch (kind) {
    case 'album':
      return track.album;
    case 'artist':
      return track.artist;
    case 'albumArtist':
      return track.albumArtist;
    case 'genre':
      return track.genre;
    case 'year':
      return track.year === null ? null : String(track.year);
  }
}

/**
 * A to Z on cached sort keys (no case, no accents, numbers by value), like the
 * song list. A collator sends every compare through Java on Android, and
 * Search groups the whole library three times as it opens.
 */
const compareText = (first: string, second: string) => {
  const a = textSortKey(first);
  const b = textSortKey(second);
  return a < b ? -1 : a > b ? 1 : 0;
};

/**
 * Songs grouped by one tag. Albums with the same name by different artists
 * stay apart. Names sort A to Z and years newest first, with songs missing
 * the tag gathered last.
 */
export function groupTracks(tracks: MusicTrack[], kind: GroupKind): TrackGroup[] {
  const groups = new Map<string, TrackGroup>();
  tracks.forEach((track) => {
    const value = groupValue(track, kind);
    const albumBy = kind === 'album' ? track.albumArtist ?? track.artist : null;
    const key = groupKeyFor(track, kind);
    const group = groups.get(key) ?? {
      key,
      title: value ?? UNKNOWN[kind],
      // Untagged songs come from many artists, so none is named.
      subtitle: value === null ? null : albumBy,
      tracks: [],
    };
    group.tracks.push(track);
    groups.set(key, group);
  });
  const known = [...groups.values()].filter((group) => group.key !== '');
  known.sort((first, second) =>
    kind === 'year'
      ? Number(second.title) - Number(first.title)
      : compareText(first.title, second.title) ||
        compareText(first.subtitle ?? '', second.subtitle ?? ''),
  );
  // Album songs play in track order.
  if (kind === 'album') {
    known.forEach((group) =>
      group.tracks.sort(
        (first, second) => (first.trackNumber ?? 9999) - (second.trackNumber ?? 9999),
      ),
    );
  }
  const unknown = groups.get('');
  return unknown ? [...known, unknown] : known;
}

/** How Library's Albums and Artists tabs can be ordered. */
export type GroupSort = 'name' | 'artist' | 'year' | 'dateAdded' | 'songCount';

function newestOf(tracks: MusicTrack[], value: (track: MusicTrack) => number | null | undefined) {
  let newest: number | null = null;
  for (const track of tracks) {
    const current = value(track);
    if (current != null && (newest === null || current > newest)) {
      newest = current;
    }
  }
  return newest;
}

/**
 * Orders albums or artists. An album's year and date added are its newest
 * song's. Groups missing the value, and the untagged group, go last in
 * either direction; ties fall back to the name.
 */
export function sortGroups(
  groups: TrackGroup[],
  by: GroupSort,
  direction: SortDirection,
): TrackGroup[] {
  const sign = direction === 'ascending' ? 1 : -1;
  const valueOf = (group: TrackGroup): string | number | null => {
    switch (by) {
      case 'name':
        return group.title;
      case 'artist':
        return group.subtitle;
      case 'year':
        return newestOf(group.tracks, (track) => track.year);
      case 'dateAdded':
        return newestOf(group.tracks, (track) => track.dateAdded);
      case 'songCount':
        return group.tracks.length;
    }
  };
  const decorated = groups.map((group) => ({
    group,
    value: group.key === '' ? null : valueOf(group),
  }));
  decorated.sort((first, second) => {
    if ((first.value === null) !== (second.value === null)) {
      return first.value === null ? 1 : -1;
    }
    const comparison =
      first.value === null || second.value === null
        ? 0
        : typeof first.value === 'string'
          ? compareText(first.value, second.value as string)
          : first.value - (second.value as number);
    return sign * comparison || compareText(first.group.title, second.group.title);
  });
  return decorated.map((entry) => entry.group);
}

export type SmartListId =
  | 'favorites'
  | 'mostPlayed'
  | 'topRated'
  | 'lowRated'
  | 'recentlyAdded'
  | 'recentlyPlayed'
  | 'longest';

/** A list of songs, with an optional figure to show on each row. */
export type SongList = {
  tracks: MusicTrack[];
  /** Plays, stars or time, keyed by track id. Rows show song length without one. */
  values?: Map<string, number>;
};

export function smartList(
  id: SmartListId,
  tracks: MusicTrack[],
  history: ListeningEvent[],
  ratings: Readonly<Record<string, number>>,
  favorites: ReadonlySet<string>,
): SongList {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  switch (id) {
    case 'favorites':
      return { tracks: tracks.filter((track) => favorites.has(track.id)) };
    case 'mostPlayed': {
      const plays = new Map<string, number>();
      history.forEach((event) => plays.set(event.trackId, (plays.get(event.trackId) ?? 0) + 1));
      return {
        tracks: [...plays]
          .sort((first, second) => second[1] - first[1])
          .map(([trackId]) => byId.get(trackId))
          .filter((track): track is MusicTrack => track !== undefined)
          .slice(0, 100),
        values: plays,
      };
    }
    case 'topRated':
    case 'lowRated': {
      const wanted = id === 'topRated' ? [4, 5] : [1, 2];
      const values = new Map(Object.entries(ratings));
      return {
        tracks: tracks
          .filter((track) => wanted.includes(ratings[track.id] ?? 0))
          .sort((first, second) =>
            id === 'topRated'
              ? ratings[second.id] - ratings[first.id]
              : ratings[first.id] - ratings[second.id],
          ),
        values,
      };
    }
    case 'recentlyAdded':
      return {
        tracks: tracks
          .filter((track) => track.dateAdded !== null)
          .sort((first, second) => (second.dateAdded ?? 0) - (first.dateAdded ?? 0))
          .slice(0, 100),
      };
    case 'recentlyPlayed': {
      const seen = new Map<string, number>();
      history.forEach((event) => {
        if (!seen.has(event.trackId)) {
          seen.set(event.trackId, event.playedAt);
        }
      });
      return {
        tracks: [...seen.keys()]
          .map((trackId) => byId.get(trackId))
          .filter((track): track is MusicTrack => track !== undefined)
          .slice(0, 100),
        values: seen,
      };
    }
    case 'longest':
      return {
        tracks: [...tracks].sort((first, second) => second.duration - first.duration).slice(0, 100),
      };
  }
}

/**
 * Phone folders as groups, so Folders lists and sorts like Genres. The
 * subtitle is where the folder sits ("Music" for Music/Rock), since two
 * folders can share a name.
 */
export function folderGroups(tracks: MusicTrack[]): TrackGroup[] {
  const groups = new Map<string, TrackGroup>();
  for (const track of tracks) {
    let group = groups.get(track.folderId);
    if (!group) {
      const parent = track.path.split('/').slice(0, -2).filter(Boolean).join('/');
      group = { key: track.folderId, title: track.folderTitle, subtitle: parent || null, tracks: [] };
      groups.set(track.folderId, group);
    }
    group.tracks.push(track);
  }
  return [...groups.values()];
}
