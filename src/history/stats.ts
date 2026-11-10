import type { ListeningEvent, MusicTrack } from '../types';

const LABEL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const LABEL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Listening stats, worked out from the saved play history. Pure functions with
 * no runtime imports, so `scripts/check-stats.mjs` can run them in plain Node.
 */

/** 'week' is the calendar week from the chosen start day; the others are rolling. */
export type StatsRange = 'week' | '7d' | '30d' | 'all';

const DAY_MS = 86_400_000;
/** A play under this many seconds (or 80% of a short song) counts as a skip. */
const SKIP_SECONDS = 30;
/** A gap longer than this between songs starts a new listening session. */
const SESSION_GAP_MS = 10 * 60_000;

type Lookup = (trackId: string) => MusicTrack | undefined;

export type Bucket = { key: string; label: string; seconds: number; plays: number };
export type RankedTrack = { id: string; title: string; artist: string | null; plays: number; seconds: number };
export type RankedName = { name: string; plays: number; seconds: number; trackId: string };

export type ListeningStats = {
  plays: number;
  seconds: number;
  /** Share of `seconds` guessed from song length, for plays saved before timing. */
  estimatedShare: number;
  uniqueTracks: number;
  uniqueArtists: number;
  activeDays: number;
  /** Days in the range, for daily averages. */
  dayCount: number;
  previous: { plays: number; seconds: number } | null;
  /** Days for 7d and 30d, weeks for all time. */
  buckets: Bucket[];
  bucketUnit: 'day' | 'week';
  /** Seconds listened in each hour of the day, 0 = midnight. */
  hours: number[];
  /** Seconds listened on each weekday, Monday first. */
  weekdays: number[];
  topTracks: RankedTrack[];
  topArtists: RankedName[];
  topAlbums: RankedName[];
  topFolders: RankedName[];
  topGenres: RankedName[];
  /** Plays of songs with a genre tag, since untagged songs cannot be ranked. */
  genrePlays: number;
  /** Only plays with measured time can be judged. */
  skips: { measured: number; skipped: number };
  /** Plays of songs heard for the first time in this range. */
  firstListens: number;
  sessions: { count: number; longestSeconds: number; averageSeconds: number };
};

export function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addDays(time: number, days: number): number {
  const date = new Date(time);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export function dayKey(time: number): string {
  const date = new Date(time);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Monday-first weekday, 0 to 6. */
function weekday(time: number): number {
  return (new Date(time).getDay() + 6) % 7;
}

function songLength(event: ListeningEvent, lookup: Lookup): number {
  return event.duration ?? lookup(event.trackId)?.duration ?? 0;
}

/** Seconds heard, measured when saved, otherwise the song's length. */
export function listenedSeconds(event: ListeningEvent, lookup: Lookup): number {
  return event.listenedSeconds ?? songLength(event, lookup);
}

export function isSkip(event: ListeningEvent): boolean {
  if (event.listenedSeconds === undefined) {
    return false;
  }
  const limit = event.duration ? Math.min(SKIP_SECONDS, event.duration * 0.8) : SKIP_SECONDS;
  return event.listenedSeconds < limit;
}

function rangeStart(history: ListeningEvent[], range: StatsRange, now: number, weekStart: WeekStart): number {
  const today = startOfDay(now);
  if (range === 'week') {
    return addDays(today, -((new Date(today).getDay() - weekStart + 7) % 7));
  }
  if (range === '7d') {
    return addDays(today, -6);
  }
  if (range === '30d') {
    return addDays(today, -29);
  }
  const oldest = history.reduce((min, event) => Math.min(min, event.playedAt), now);
  return startOfDay(oldest);
}

function rank<T extends { plays: number; seconds: number }>(items: Iterable<T>, limit: number): T[] {
  return [...items]
    .sort((first, second) => second.plays - first.plays || second.seconds - first.seconds)
    .slice(0, limit);
}

function tally(
  map: Map<string, RankedName>,
  name: string | null | undefined,
  trackId: string,
  seconds: number,
) {
  if (!name) {
    return;
  }
  const entry = map.get(name) ?? { name, plays: 0, seconds: 0, trackId };
  entry.plays += 1;
  entry.seconds += seconds;
  map.set(name, entry);
}

export function computeStats(
  history: ListeningEvent[],
  range: StatsRange,
  lookup: Lookup,
  now = Date.now(),
  weekStart: WeekStart = 6,
): ListeningStats {
  const start = rangeStart(history, range, now, weekStart);
  const end = addDays(startOfDay(now), 1);
  const dayCount = Math.max(1, Math.round((end - start) / DAY_MS));
  const inRange = history.filter((event) => event.playedAt >= start && event.playedAt < end);

  let previous: ListeningStats['previous'] = null;
  if (range !== 'all') {
    // A calendar week compares with the same days of the week before, so a
    // half-finished week is never set against a whole one.
    const previousStart = addDays(start, range === 'week' ? -7 : -dayCount);
    const previousEnd = addDays(previousStart, dayCount);
    const before = history.filter(
      (event) => event.playedAt >= previousStart && event.playedAt < previousEnd,
    );
    previous = {
      plays: before.length,
      seconds: before.reduce((total, event) => total + listenedSeconds(event, lookup), 0),
    };
  }

  // The first time each song shows up anywhere in the saved history.
  const firstPlayed = new Map<string, number>();
  history.forEach((event) => {
    const known = firstPlayed.get(event.trackId);
    if (known === undefined || event.playedAt < known) {
      firstPlayed.set(event.trackId, event.playedAt);
    }
  });

  const bucketUnit = range === 'all' ? 'week' : 'day';
  const bucketStart =
    bucketUnit === 'week' ? addDays(start, -weekday(start)) : start;
  const bucketDays = bucketUnit === 'week' ? 7 : 1;
  const buckets: Bucket[] = [];
  // A calendar week shows all seven days; the ones still to come stay empty.
  const bucketEnd = range === 'week' ? addDays(start, 7) : end;
  for (let time = bucketStart; time < bucketEnd; time = addDays(time, bucketDays)) {
    const date = new Date(time);
    buckets.push({
      key: dayKey(time),
      // Fixed names like the rest of Muse ("3 Nov", "Mon"): Intl date formatting
      // is slow on Hermes, and All time has a bucket per week.
      label:
        bucketUnit === 'week' || range === '30d'
          ? `${date.getDate()} ${LABEL_MONTHS[date.getMonth()]}`
          : LABEL_DAYS[date.getDay()],
      seconds: 0,
      plays: 0,
    });
  }
  const bucketIndex = (time: number) =>
    Math.min(
      buckets.length - 1,
      Math.floor(Math.round((startOfDay(time) - bucketStart) / DAY_MS) / bucketDays),
    );

  const hours = Array.from({ length: 24 }, () => 0);
  const weekdays = Array.from({ length: 7 }, () => 0);
  const tracks = new Map<string, RankedTrack>();
  const artists = new Map<string, RankedName>();
  const albums = new Map<string, RankedName>();
  const folders = new Map<string, RankedName>();
  const genres = new Map<string, RankedName>();
  const days = new Set<string>();
  let seconds = 0;
  let estimatedSeconds = 0;
  let measured = 0;
  let skipped = 0;
  let firstListens = 0;
  let genrePlays = 0;

  inRange.forEach((event) => {
    const heard = listenedSeconds(event, lookup);
    const time = new Date(event.playedAt);
    seconds += heard;
    if (event.listenedSeconds === undefined) {
      estimatedSeconds += heard;
    } else {
      measured += 1;
      skipped += isSkip(event) ? 1 : 0;
    }
    if (firstPlayed.get(event.trackId) === event.playedAt) {
      firstListens += 1;
    }
    days.add(dayKey(event.playedAt));
    hours[time.getHours()] += heard;
    weekdays[weekday(event.playedAt)] += heard;
    const bucket = buckets[bucketIndex(event.playedAt)];
    bucket.seconds += heard;
    bucket.plays += 1;

    const track = tracks.get(event.trackId) ?? {
      id: event.trackId,
      title: event.title,
      artist: event.artist,
      plays: 0,
      seconds: 0,
    };
    track.plays += 1;
    track.seconds += heard;
    tracks.set(event.trackId, track);

    tally(artists, event.artist, event.trackId, heard);
    tally(albums, event.album ?? lookup(event.trackId)?.album, event.trackId, heard);
    tally(folders, event.folderTitle, event.trackId, heard);
    const genre = event.genre ?? lookup(event.trackId)?.genre;
    if (genre) {
      genrePlays += 1;
      tally(genres, genre, event.trackId, heard);
    }
  });

  return {
    plays: inRange.length,
    seconds,
    estimatedShare: seconds > 0 ? estimatedSeconds / seconds : 0,
    uniqueTracks: tracks.size,
    uniqueArtists: artists.size,
    activeDays: days.size,
    dayCount,
    previous,
    buckets,
    bucketUnit,
    hours,
    weekdays,
    topTracks: rank(tracks.values(), 10),
    topArtists: rank(artists.values(), 8),
    topAlbums: rank(albums.values(), 10),
    topFolders: rank(folders.values(), 6),
    topGenres: rank(genres.values(), 8),
    genrePlays,
    skips: { measured, skipped },
    firstListens,
    sessions: getSessions(inRange, lookup),
  };
}

function getSessions(events: ListeningEvent[], lookup: Lookup): ListeningStats['sessions'] {
  const ordered = [...events].sort((first, second) => first.playedAt - second.playedAt);
  const lengths: number[] = [];
  let sessionStart = 0;
  let sessionEnd = -Infinity;
  ordered.forEach((event) => {
    const finish = event.playedAt + listenedSeconds(event, lookup) * 1000;
    if (event.playedAt > sessionEnd + SESSION_GAP_MS) {
      if (sessionEnd > -Infinity) {
        lengths.push((sessionEnd - sessionStart) / 1000);
      }
      sessionStart = event.playedAt;
    }
    sessionEnd = Math.max(sessionEnd, finish);
  });
  if (sessionEnd > -Infinity) {
    lengths.push((sessionEnd - sessionStart) / 1000);
  }
  const total = lengths.reduce((sum, length) => sum + length, 0);
  return {
    count: lengths.length,
    longestSeconds: Math.max(0, ...lengths),
    averageSeconds: lengths.length ? total / lengths.length : 0,
  };
}

/** Days in a row with at least one play. Today without plays yet keeps the streak. */
export function getStreaks(history: ListeningEvent[], now = Date.now()) {
  return streaksFrom(new Set(history.map((event) => dayKey(event.playedAt))), now);
}

/** Seconds heard on each day, by day key. */
export function getDailySeconds(history: ListeningEvent[], lookup: Lookup): Map<string, number> {
  const totals = new Map<string, number>();
  history.forEach((event) => {
    const key = dayKey(event.playedAt);
    totals.set(key, (totals.get(key) ?? 0) + listenedSeconds(event, lookup));
  });
  return totals;
}

/** The day a calendar week starts on, as Date.getDay(): 6 Saturday, 0 Sunday, 1 Monday. */
export type WeekStart = 0 | 1 | 6;

/**
 * The calendar week that holds `now`, from `weekStart`. Days after today have
 * null seconds. `previousSeconds` covers the same days of the week before, so a
 * half-finished week is never compared with a whole one.
 */
export function getWeek(history: ListeningEvent[], lookup: Lookup, weekStart: WeekStart, now = Date.now()) {
  const today = startOfDay(now);
  const start = addDays(today, -((new Date(today).getDay() - weekStart + 7) % 7));
  const daily = getDailySeconds(history, lookup);
  const days = Array.from({ length: 7 }, (_, index) => {
    const time = addDays(start, index);
    return {
      time,
      seconds: time > today ? null : (daily.get(dayKey(time)) ?? 0),
      /** The same day last week, drawn as a ghost behind this week's bar. */
      previous: daily.get(dayKey(addDays(time, -7))) ?? 0,
    };
  });
  const sofar = days.filter((day) => day.seconds !== null);
  return {
    start,
    days,
    seconds: sofar.reduce((sum, day) => sum + (day.seconds ?? 0), 0),
    previousSeconds: sofar.reduce((sum, day) => sum + (daily.get(dayKey(addDays(day.time, -7))) ?? 0), 0),
  };
}

/** Today's progress toward a daily goal, and the days the goal was met. */
export function getGoalSummary(
  history: ListeningEvent[],
  lookup: Lookup,
  goalSeconds: number,
  now = Date.now(),
) {
  const daily = getDailySeconds(history, lookup);
  const metDays = new Set(
    [...daily].filter(([, seconds]) => goalSeconds > 0 && seconds >= goalSeconds).map(([key]) => key),
  );
  return {
    todaySeconds: daily.get(dayKey(now)) ?? 0,
    metDays,
    streaks: streaksFrom(metDays, now),
  };
}

function streaksFrom(days: Set<string>, now: number) {
  let current = 0;
  let day = startOfDay(now);
  if (!days.has(dayKey(day))) {
    day = addDays(day, -1);
  }
  while (days.has(dayKey(day))) {
    current += 1;
    day = addDays(day, -1);
  }

  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let last: number | null = null;
  sorted.forEach((key) => {
    const [year, month, date] = key.split('-').map(Number);
    const time = new Date(year, month - 1, date).getTime();
    run = last !== null && dayKey(addDays(last, 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    last = time;
  });
  // The best run before this one: "New best" only when the current run passes it.
  let previousBest = 0;
  run = 0;
  last = null;
  sorted.forEach((key, index) => {
    const [year, month, date] = key.split('-').map(Number);
    const time = new Date(year, month - 1, date).getTime();
    run = last !== null && dayKey(addDays(last, 1)) === key ? run + 1 : 1;
    const endsRun = index === sorted.length - 1 || sorted[index + 1] !== dayKey(addDays(time, 1));
    const isCurrent = current > 0 && index === sorted.length - 1;
    if (endsRun && !isCurrent) {
      previousBest = Math.max(previousBest, run);
    }
    last = time;
  });
  return { current, best, previousBest, playedToday: days.has(dayKey(now)) };
}

/**
 * Seconds per day for the last `weeks` weeks, as columns of Monday-first days.
 * Days after today are null.
 */
export function getCalendar(
  history: ListeningEvent[],
  lookup: Lookup,
  weeks: number,
  now = Date.now(),
): { start: number; columns: (number | null)[][] } {
  const today = startOfDay(now);
  const start = addDays(today, -weekday(today) - (weeks - 1) * 7);
  const totals = new Map<string, number>();
  history.forEach((event) => {
    if (event.playedAt >= start) {
      const key = dayKey(event.playedAt);
      totals.set(key, (totals.get(key) ?? 0) + listenedSeconds(event, lookup));
    }
  });
  const columns = Array.from({ length: weeks }, (_, column) =>
    Array.from({ length: 7 }, (_, row) => {
      const time = addDays(start, column * 7 + row);
      return time > today ? null : totals.get(dayKey(time)) ?? 0;
    }),
  );
  return { start, columns };
}

/** Share of the library's songs played at least once. */
export function getLibraryCoverage(history: ListeningEvent[], tracks: MusicTrack[]) {
  if (tracks.length === 0) {
    return { played: 0, total: 0 };
  }
  const heard = new Set(history.map((event) => event.trackId));
  const played = tracks.reduce((count, track) => count + (heard.has(track.id) ? 1 : 0), 0);
  return { played, total: tracks.length };
}

/**
 * Saves how long the play that started at `playedAt` was heard. Keeps the
 * larger value, since a listen only grows, and returns the same list when
 * nothing changed so it is not saved again.
 */
export function withListenedSeconds(
  history: ListeningEvent[],
  playedAt: number,
  seconds: number,
): ListeningEvent[] {
  const index = history.findIndex((event) => event.playedAt === playedAt);
  const rounded = Math.round(seconds);
  if (index < 0 || (history[index].listenedSeconds ?? -1) >= rounded) {
    return history;
  }
  const next = [...history];
  next[index] = { ...history[index], listenedSeconds: rounded };
  return next;
}

/** Most recent plays, one per song. */
export function getRecentTracks(history: ListeningEvent[], limit: number): ListeningEvent[] {
  const seen = new Set<string>();
  const recent: ListeningEvent[] = [];
  for (const event of history) {
    if (!seen.has(event.trackId)) {
      seen.add(event.trackId);
      recent.push(event);
      if (recent.length === limit) {
        break;
      }
    }
  }
  return recent;
}

/** Index of the largest value, or -1 when all are zero. */
export function peakIndex(values: number[]): number {
  let best = -1;
  values.forEach((value, index) => {
    if (value > 0 && (best < 0 || value > values[best])) {
      best = index;
    }
  });
  return best;
}
