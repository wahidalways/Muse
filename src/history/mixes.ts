import type { ListeningEvent, MusicTrack } from '../types';

/**
 * Ready-made queues for Home, built only from the library, favorites and play
 * history. No runtime imports, so `scripts/check-stats.mjs` can test it.
 */

export type MixId = 'shuffle' | 'liked' | 'repeat' | 'added' | 'rediscover' | 'unheard';

export type Mix = {
  id: MixId;
  title: string;
  hint: string;
  tracks: MusicTrack[];
  /** Play in random order rather than the listed order. */
  shuffle: boolean;
};

const RECENT_MS = 30 * 86_400_000;
/** Smart mixes need a few songs before they are worth showing. */
const MIN_MIX_SIZE = 3;

export function getMixes(
  history: ListeningEvent[],
  tracks: MusicTrack[],
  favorites: ReadonlySet<string>,
  now = Date.now(),
): Mix[] {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const since = now - RECENT_MS;
  const allPlays = new Map<string, number>();
  const recentPlays = new Map<string, number>();
  const lastPlayed = new Map<string, number>();
  history.forEach((event) => {
    allPlays.set(event.trackId, (allPlays.get(event.trackId) ?? 0) + 1);
    if (event.playedAt >= since) {
      recentPlays.set(event.trackId, (recentPlays.get(event.trackId) ?? 0) + 1);
    }
    lastPlayed.set(event.trackId, Math.max(lastPlayed.get(event.trackId) ?? 0, event.playedAt));
  });
  const ranked = (counts: [string, number][]) =>
    counts
      .sort((first, second) => second[1] - first[1])
      .map(([trackId]) => byId.get(trackId))
      .filter((track): track is MusicTrack => track !== undefined);

  const mixes: Omit<Mix, 'hint'>[] = [
    { id: 'shuffle', title: 'Shuffle all', tracks, shuffle: true },
    {
      id: 'liked',
      title: 'Favorites',
      tracks: tracks.filter((track) => favorites.has(track.id)),
      shuffle: false,
    },
    { id: 'repeat', title: 'Heavy rotation', tracks: ranked([...recentPlays]).slice(0, 25), shuffle: false },
    {
      id: 'added',
      title: 'Recently added',
      tracks: tracks
        .filter((track) => track.dateAdded !== null)
        .sort((first, second) => (second.dateAdded ?? 0) - (first.dateAdded ?? 0))
        .slice(0, 30),
      shuffle: false,
    },
    {
      id: 'rediscover',
      title: 'Rediscover',
      // Songs you played before, but not in the last 30 days.
      tracks: ranked(
        [...allPlays].filter(([trackId]) => (lastPlayed.get(trackId) ?? 0) < since),
      ).slice(0, 30),
      shuffle: false,
    },
    {
      id: 'unheard',
      title: 'Never played',
      tracks: tracks.filter((track) => !allPlays.has(track.id)),
      shuffle: true,
    },
  ];

  return mixes
    .filter((mix) =>
      mix.tracks.length >= (mix.id === 'shuffle' || mix.id === 'liked' ? 1 : MIN_MIX_SIZE),
    )
    .map((mix) => ({
      ...mix,
      hint: `${mix.tracks.length} ${mix.tracks.length === 1 ? 'song' : 'songs'}`,
    }));
}
