/**
 * Finds a song's cover online, on Apple Music (iTunes Search) and Deezer.
 * Both are free and need no account. Only the search words leave the phone;
 * small previews show in the grid, and only the chosen cover downloads, at
 * the biggest size the service has.
 */

export type OnlineCover = {
  /** Unique per result, and stored as the chosen cover's `ref`. */
  id: string;
  /** The album (or single) it belongs to. */
  name: string;
  /** About 300 px, for the grid. */
  preview: string;
  /** The biggest size the service has. */
  full: string;
  source: 'Apple Music' | 'Deezer';
};

export type CoverSearch = { covers: OnlineCover[]; offline: boolean };

const LIMIT = 12;
const TIMEOUT_MS = 10_000;

/** The words to search for: the artist and the album (or the title when there is no album). */
export function coverQuery(track: { title: string; artist: string | null; album: string | null }): string {
  return [track.artist, track.album || track.title].filter(Boolean).join(' ').trim();
}

// Apple's links end in a size, such as /100x100bb.jpg. Asking for 3000 returns
// the original when it is smaller (checked 2026-11-10: 1425 px came back).
const APPLE_SIZE = /\/\d+x\d+bb\.(jpg|png|webp)$/;
// Deezer's end in /1000x1000-000000-80-0-0.jpg: size and quality. 1800 at
// quality 100 is the biggest it serves (3000 is refused).
const DEEZER_SIZE = /\/\d+x\d+-\d+-\d+-\d+-\d+\.jpg$/;

export function parseApple(json: unknown): OnlineCover[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) {
    return [];
  }
  return results.flatMap((item: unknown) => {
    const entry = item as { artworkUrl100?: unknown; collectionName?: unknown } | null;
    const art = typeof entry?.artworkUrl100 === 'string' ? entry.artworkUrl100 : '';
    if (!APPLE_SIZE.test(art)) {
      return [];
    }
    return [
      {
        id: `apple:${art}`,
        name: typeof entry?.collectionName === 'string' ? entry.collectionName : '',
        preview: art.replace(APPLE_SIZE, '/300x300bb.jpg'),
        full: art.replace(APPLE_SIZE, '/3000x3000bb.jpg'),
        source: 'Apple Music' as const,
      },
    ];
  });
}

export function parseDeezer(json: unknown): OnlineCover[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.flatMap((item: unknown) => {
    const entry = item as { cover_xl?: unknown; cover_medium?: unknown; title?: unknown } | null;
    const big = typeof entry?.cover_xl === 'string' ? entry.cover_xl : '';
    if (!DEEZER_SIZE.test(big)) {
      return [];
    }
    return [
      {
        id: `deezer:${big}`,
        name: typeof entry?.title === 'string' ? entry.title : '',
        preview: typeof entry?.cover_medium === 'string' ? entry.cover_medium : big,
        full: big.replace(DEEZER_SIZE, '/1800x1800-000000-100-0-0.jpg'),
        source: 'Deezer' as const,
      },
    ];
  });
}

/** One list, taking turns between the two services (each is already best match first), without repeats. */
export function mergeCovers(first: OnlineCover[], second: OnlineCover[], limit = LIMIT): OnlineCover[] {
  const merged: OnlineCover[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
    for (const cover of [first[index], second[index]]) {
      if (cover && !seen.has(cover.full)) {
        seen.add(cover.full);
        merged.push(cover);
      }
    }
  }
  return merged.slice(0, limit);
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Search failed (${response.status})`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Searches both services at once. `offline` is true only when neither could be reached. */
export async function searchCovers(query: string): Promise<CoverSearch> {
  const words = encodeURIComponent(query.trim());
  if (!words) {
    return { covers: [], offline: false };
  }
  const [apple, deezer] = await Promise.allSettled([
    getJson(`https://itunes.apple.com/search?media=music&entity=album&limit=${LIMIT}&term=${words}`),
    getJson(`https://api.deezer.com/search/album?limit=${LIMIT}&q=${words}`),
  ]);
  return {
    covers: mergeCovers(
      apple.status === 'fulfilled' ? parseApple(apple.value) : [],
      deezer.status === 'fulfilled' ? parseDeezer(deezer.value) : [],
    ),
    offline: apple.status === 'rejected' && deezer.status === 'rejected',
  };
}
