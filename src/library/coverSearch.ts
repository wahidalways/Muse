/**
 * Finds a song's cover online: Apple Music (iTunes Search) and Deezer, both
 * free with no account, and MusicBrainz's Cover Art Archive when those two
 * have nothing that fits. Only the search words leave the phone; small
 * previews show in the grid, and only the chosen cover downloads, at the
 * biggest size the service has.
 *
 * Finding the right one: the words are cleaned first (track numbers, "Official
 * Video", "320kbps"...), albums and songs are both searched, and every result
 * is ranked against the song's own tags and length. Song length is the
 * strongest sign: the same recording is within a second or two everywhere.
 * Tribute, karaoke and piano versions sink unless the song is one itself.
 */

export type OnlineCover = {
  /** Unique per result, and stored as the chosen cover's `ref`. */
  id: string;
  /** The album (or single) it belongs to. */
  name: string;
  /** The album's artist, when the service says. */
  artist?: string;
  /** About 300 px, for the grid. */
  preview: string;
  /** The biggest size the service has. */
  full: string;
  source: 'Apple Music' | 'Deezer' | 'Cover Art Archive';
  /** Set for song results: the song's title and length, used for ranking. */
  title?: string;
  seconds?: number;
};

export type CoverSearch = { covers: OnlineCover[]; offline: boolean };

/** What the search knows about the song. */
export type CoverSong = { title: string; artist: string | null; album: string | null; duration?: number };

const LIMIT = 12;
const PER_SERVICE = 10;
const TIMEOUT_MS = 10_000;
/** Below this, Apple and Deezer found nothing that fits, so MusicBrainz is asked too. */
const GOOD_MATCH = 4;
/** MusicBrainz asks every app to name itself. */
const USER_AGENT = 'Muse/1.1 ( https://github.com/wahidalways/Muse )';

// ---------------------------------------------------------------------------
// Cleaning the words

/** Bits of file names and video titles that are never part of the song's name. */
const JUNK = [
  /\((?:official|lyrics?|lyric video|audio|video|music video|hd|hq|4k|visuali[sz]er|explicit|clean)[^)]*\)/gi,
  /\[(?:official|lyrics?|audio|video|hd|hq|4k|mp3|flac|explicit|clean|\d+\s*kbps)[^\]]*\]/gi,
  /\b\d{2,3}\s*kbps\b/gi,
  /\b(?:www\.)?[a-z0-9-]+\.(?:com|net|org|in|info|xyz|co|me|pk|bd)\b/gi,
  /\.(?:mp3|flac|wav|m4a|ogg|opus|ape|wv|aiff?|dsf|dff)$/i,
];

/** A title or name without file-name noise: "01 - Yellow (Official Video) [320kbps]" -> "Yellow". */
export function cleanWords(text: string): string {
  // A track number needs its own separator ("01 - ", "1. ", "03_"), so "99 Problems" keeps its 99.
  let clean = text.replace(/^\s*(?:track\s*)?\d{1,3}\s*[-._)]\s*/i, '').replace(/_/g, ' ');
  for (const pattern of JUNK) {
    clean = clean.replace(pattern, ' ');
  }
  return clean
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—.]+|[\s\-–—.]+$/g, '')
    .trim();
}

/** "Coldplay - Yellow" in a title with no artist tag: the artist and the title. */
export function splitArtistTitle(title: string): { artist: string; title: string } | null {
  const parts = cleanWords(title).split(/\s+[-–—]\s+/);
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { artist: parts[0].trim(), title: parts[1].trim() };
}

/** The song's artist and title as the search uses them, with file-name noise gone. */
export function songWords(song: CoverSong): { artist: string | null; title: string; album: string | null } {
  const title = cleanWords(song.title) || song.title.trim();
  if (song.artist) {
    return { artist: cleanWords(song.artist) || song.artist, title, album: song.album ? cleanWords(song.album) || song.album : null };
  }
  const split = splitArtistTitle(song.title);
  return split
    ? { artist: split.artist, title: split.title, album: song.album }
    : { artist: null, title, album: song.album ? cleanWords(song.album) || song.album : null };
}

/** The words shown in the search field: the artist and the album (or the title when there is no album). */
export function coverQuery(song: CoverSong): string {
  const words = songWords(song);
  return [words.artist, words.album || words.title].filter(Boolean).join(' ').trim();
}

// ---------------------------------------------------------------------------
// Ranking

/** Lowercase letters and digits only (any script), for comparing names. */
export function normalize(text: string | undefined | null): string {
  return (text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\((?:feat|ft|with)\.?[^)]*\)|\s*\[(?:feat|ft)\.?[^\]]*\]/g, '')
    .replace(/\b(?:the|a)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** 1 for the same name, about 0.8 when one holds the other, else the share of words in common. */
export function similarity(a: string | undefined | null, b: string | undefined | null): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) {
    return 0;
  }
  if (x === y) {
    return 1;
  }
  if (x.includes(y) || y.includes(x)) {
    return 0.8;
  }
  const xs = new Set(x.split(' '));
  const ys = new Set(y.split(' '));
  let shared = 0;
  xs.forEach((word) => {
    if (ys.has(word)) {
      shared += 1;
    }
  });
  return shared / Math.max(xs.size, ys.size);
}

/** Words that mark a remake of a song, not the song. */
const REMAKE = /\b(?:tribute|karaoke|piano|instrumental|lullaby|lullabies|8[- ]?bit|made famous|in the style of|cover version|covers|cello|guitar version|acoustic version|ringtone|workout|backing track)\b/i;

/** How well a result fits the song; higher is better. Exported for the self-check. */
export function scoreCover(cover: OnlineCover, song: CoverSong): number {
  const words = songWords(song);
  let score = 0;
  if (words.artist) {
    score += 3 * similarity(cover.artist, words.artist);
  }
  const albumFit = words.album ? similarity(cover.name, words.album) : 0;
  // A single is usually named after the song.
  const singleFit = similarity(cover.name.replace(/\s*-\s*(?:single|ep)$/i, ''), words.title) * 0.8;
  const titleFit = cover.title ? similarity(cover.title, words.title) : 0;
  score += 2 * Math.max(albumFit, singleFit, titleFit);
  // A known album beats compilations that merely hold the song.
  if (words.album) {
    score += 1.5 * albumFit;
  }
  if (cover.seconds && song.duration && song.duration > 0) {
    const off = Math.abs(cover.seconds - song.duration);
    score += off <= 2 ? 2 : off <= 5 ? 1 : off > 20 ? -1 : 0;
  }
  const own = `${song.title} ${song.album ?? ''}`;
  if (REMAKE.test(`${cover.name} ${cover.title ?? ''} ${cover.artist ?? ''}`) && !REMAKE.test(own)) {
    score -= 2.5;
  }
  return score;
}

// ---------------------------------------------------------------------------
// The services' answers

// Apple's links end in a size, such as /100x100bb.jpg. Asking for 3000 returns
// the original when it is smaller (checked 2026-11-10: 1425 px came back).
const APPLE_SIZE = /\/\d+x\d+bb\.(jpg|png|webp)$/;
// Deezer's end in /1000x1000-000000-80-0-0.jpg: size and quality. 1800 at
// quality 100 is the biggest it serves (3000 is refused).
const DEEZER_SIZE = /\/\d+x\d+-\d+-\d+-\d+-\d+\.jpg$/;

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

/** Apple album or song results. */
export function parseApple(json: unknown): OnlineCover[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) {
    return [];
  }
  return results.flatMap((item: unknown) => {
    const entry = item as Record<string, unknown> | null;
    const art = text(entry?.artworkUrl100) ?? '';
    if (!APPLE_SIZE.test(art)) {
      return [];
    }
    const millis = typeof entry?.trackTimeMillis === 'number' ? entry.trackTimeMillis : undefined;
    return [
      {
        id: `apple:${art}`,
        name: text(entry?.collectionName) ?? '',
        artist: text(entry?.artistName),
        title: text(entry?.trackName),
        seconds: millis ? millis / 1000 : undefined,
        preview: art.replace(APPLE_SIZE, '/300x300bb.jpg'),
        full: art.replace(APPLE_SIZE, '/3000x3000bb.jpg'),
        source: 'Apple Music' as const,
      },
    ];
  });
}

/** Deezer album results (cover on the item) or track results (cover on item.album). */
export function parseDeezer(json: unknown): OnlineCover[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.flatMap((item: unknown) => {
    const entry = item as Record<string, unknown> | null;
    const album = (entry?.album ?? null) as Record<string, unknown> | null;
    const isTrack = album !== null && typeof album === 'object';
    const holder = isTrack ? album : entry;
    const big = text(holder?.cover_xl) ?? '';
    if (!DEEZER_SIZE.test(big)) {
      return [];
    }
    const artist = (entry?.artist ?? null) as Record<string, unknown> | null;
    return [
      {
        id: `deezer:${big}`,
        name: text(holder?.title) ?? '',
        artist: text(artist?.name),
        title: isTrack ? text(entry?.title) : undefined,
        seconds: isTrack && typeof entry?.duration === 'number' ? entry.duration : undefined,
        preview: text(holder?.cover_medium) ?? big,
        full: big.replace(DEEZER_SIZE, '/1800x1800-000000-100-0-0.jpg'),
        source: 'Deezer' as const,
      },
    ];
  });
}

/** One list, taking turns between the services (each is already best match first), without repeats. */
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

/**
 * Best fit first. One tile per album: the same album found as an album and as
 * a song, or on both services, keeps its best-scoring copy (Apple's on a tie:
 * its covers are bigger).
 */
export function rankCovers(covers: OnlineCover[], song: CoverSong | null, limit = LIMIT): OnlineCover[] {
  const scored = covers.map((cover, order) => ({ cover, order, score: song ? scoreCover(cover, song) : 0 }));
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  const seen = new Set<string>();
  const out: OnlineCover[] = [];
  for (const { cover } of scored) {
    const key = `${normalize(cover.name)}|${normalize(cover.artist)}`;
    if (seen.has(cover.full) || (cover.name && seen.has(key))) {
      continue;
    }
    seen.add(cover.full);
    seen.add(key);
    out.push(cover);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

async function getJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok) {
      throw new Error(`Search failed (${response.status})`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const term = (words: string) => encodeURIComponent(words.trim());

/** MusicBrainz releases of this recording that have a front cover in the Cover Art Archive. */
async function coverArtArchive(song: CoverSong): Promise<OnlineCover[]> {
  const words = songWords(song);
  if (!words.artist) {
    return [];
  }
  const escape = (value: string) => value.replace(/["\\]/g, ' ');
  const query = `recording:"${escape(words.title)}" AND artist:"${escape(words.artist)}"`;
  const json = (await getJson(`https://musicbrainz.org/ws/2/recording?fmt=json&limit=5&query=${term(query)}`, {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
  })) as { recordings?: { title?: string; length?: number; releases?: { id: string; title?: string }[]; 'artist-credit'?: { name?: string }[] }[] };
  const releases: OnlineCover[] = [];
  for (const recording of json.recordings ?? []) {
    for (const release of (recording.releases ?? []).slice(0, 3)) {
      releases.push({
        id: `caa:${release.id}`,
        name: release.title ?? '',
        artist: recording['artist-credit']?.map((credit) => credit.name).join(', '),
        title: recording.title,
        seconds: recording.length ? recording.length / 1000 : undefined,
        preview: `https://coverartarchive.org/release/${release.id}/front-250`,
        full: `https://coverartarchive.org/release/${release.id}/front`,
        source: 'Cover Art Archive',
      });
    }
  }
  // Many releases have no picture: keep only those whose cover answers.
  const checked = await Promise.all(
    releases.slice(0, 6).map(async (cover) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(cover.preview, { method: 'HEAD', signal: controller.signal });
        return response.ok ? cover : null;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return checked.filter((cover): cover is OnlineCover => cover !== null);
}

/**
 * Searches the services at once. With `song`, the words come from its tags
 * (albums by artist + album, songs by artist + title) and results are ranked
 * against it; a typed `query` searches those words as they are. `offline` is
 * true only when no service could be reached.
 */
export async function searchCovers(query: string, song: CoverSong | null = null): Promise<CoverSearch> {
  const typed = query.trim();
  if (!typed) {
    return { covers: [], offline: false };
  }
  // Words the person typed are searched as they are; the song's own words also search its title.
  const isOwnWords = song !== null && typed === coverQuery(song);
  const words = song ? songWords(song) : null;
  const songTerm = isOwnWords && words ? (words.artist ? `${words.artist} ${words.title}` : words.title) : typed;
  const requests = [
    getJson(`https://itunes.apple.com/search?media=music&entity=album&limit=${PER_SERVICE}&term=${term(typed)}`),
    getJson(`https://itunes.apple.com/search?media=music&entity=song&limit=${PER_SERVICE}&term=${term(songTerm)}`),
    getJson(`https://api.deezer.com/search/album?limit=${PER_SERVICE}&q=${term(typed)}`),
    getJson(`https://api.deezer.com/search/track?limit=${PER_SERVICE}&q=${term(songTerm)}`),
  ];
  const answers = await Promise.allSettled(requests);
  const value = (index: number) => (answers[index].status === 'fulfilled' ? (answers[index] as PromiseFulfilledResult<unknown>).value : null);
  const found = [
    ...mergeCovers(parseApple(value(0)), parseDeezer(value(2)), PER_SERVICE * 2),
    ...mergeCovers(parseApple(value(1)), parseDeezer(value(3)), PER_SERVICE * 2),
  ];
  const offline = answers.every((answer) => answer.status === 'rejected');
  // The typed words count as the song when there are no tags to go by.
  const rankBy: CoverSong = song ?? { title: typed, artist: null, album: null };
  let ranked = rankCovers(found, rankBy);
  if (!offline && song && (ranked.length === 0 || scoreCover(ranked[0], song) < GOOD_MATCH)) {
    const archive = await coverArtArchive(song).catch(() => []);
    ranked = rankCovers([...found, ...archive], song);
  }
  return { covers: ranked, offline };
}
