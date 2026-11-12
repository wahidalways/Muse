// Self-check for src/history/stats.ts. Run: node scripts/check-stats.mjs
// Needs Node 22.18+ (runs TypeScript files directly).
import assert from 'node:assert/strict';
import {
  computeStats,
  getCalendar,
  getGoalSummary,
  getRecentTracks,
  getStreaks,
  getWeek,
  isSkip,
  withListenedSeconds,
} from '../src/history/stats.ts';
import { getMixes } from '../src/history/mixes.ts';
import { DEFAULT_PULSE, groupBoard, packRows, parsePulse } from '../src/settings/pulseBoard.ts';
import { groupTracks, smartList, sortGroups } from '../src/library/browse.ts';
import { sortMusicTracks } from '../src/library/sortTracks.ts';
import { createSavedStore } from '../src/library/savedStore.ts';
import {
  buildSearchIndex,
  hiddenMatch,
  matchRanges,
  matchScore,
  matchesAllWords,
  normalizeSearch,
  searchLibrary,
  searchWords,
} from '../src/library/search.ts';
import { formatAudioDetails, formatBytes, formatPlayCount, formatSleepTimer } from '../src/utils/format.ts';
import { accentForCover, tintTones } from '../src/theme/dynamicAccent.ts';
import { withQueued } from '../src/playback/queueOrder.ts';
import { minimalLabels, minimalTitleSize } from '../src/player/minimalType.ts';
import { cleanWords, coverQuery, mergeCovers, parseApple, parseDeezer, rankCovers, scoreCover, splitArtistTitle } from '../src/library/coverSearch.ts';
import { ringPath } from '../src/components/ringPath.ts';
import { indexLetter, letterPositions } from '../src/library/alphabet.ts';
import { activeLyricsLine, parseLyrics } from '../src/library/lyrics.ts';

const DAY = 86_400_000;
const now = new Date(2026, 10, 4, 20, 0).getTime(); // Wed 4 Nov 2026, 8 PM
const track = (id, duration) => ({ id, duration, album: `Album ${id}` });
const library = new Map([['a', track('a', 200)], ['b', track('b', 100)]]);
const lookup = (id) => library.get(id);
const play = (trackId, daysAgo, extra = {}) => ({
  trackId,
  title: trackId.toUpperCase(),
  artist: trackId === 'a' ? 'Artist A' : null,
  folderTitle: 'Music',
  playedAt: now - daysAgo * DAY,
  ...extra,
});

const history = [
  play('a', 0, { listenedSeconds: 180, duration: 200 }),
  play('b', 0.01, { listenedSeconds: 10, duration: 100 }), // skip
  play('a', 1), // older play, estimated at 200s
  play('b', 3),
  play('a', 9), // previous week
];

const week = computeStats(history, '7d', lookup, now);
assert.equal(week.plays, 4);
assert.equal(week.seconds, 180 + 10 + 200 + 100);
assert.equal(week.buckets.length, 7);
assert.equal(week.buckets[6].plays, 2, 'today has two plays');
assert.equal(week.previous.plays, 1);
assert.equal(week.previous.seconds, 200);
assert.deepEqual(week.skips, { measured: 2, skipped: 1 });
assert.equal(week.topTracks[0].id, 'a');
assert.equal(week.uniqueArtists, 1, 'unknown artists are not counted');
assert.equal(week.firstListens, 1, 'only b is new this week; a was first heard 9 days ago');
assert.equal(week.hours.reduce((sum, value) => sum + value, 0), week.seconds);

const all = computeStats(history, 'all', lookup, now);
assert.equal(all.plays, 5);
assert.equal(all.bucketUnit, 'week');
assert.equal(all.previous, null);
assert.equal(all.buckets.reduce((sum, bucket) => sum + bucket.plays, 0), 5);

assert.deepEqual(getStreaks(history, now), { current: 2, best: 2, previousBest: 1, playedToday: true });
// Played yesterday but not today: the run still counts, and today is not played yet.
assert.deepEqual(getStreaks(history.slice(2), now), { current: 1, best: 1, previousBest: 1, playedToday: false });
// A run longer than every earlier one is a new best; previousBest leaves the current run out.
assert.equal(getStreaks([play('a', 0), play('a', 1), play('a', 2), play('a', 5)], now).previousBest, 1);
assert.equal(isSkip({ listenedSeconds: 20, duration: 20 }), false, 'a short song played through is not a skip');
assert.equal(isSkip({ listenedSeconds: 5, duration: 20 }), true);
assert.deepEqual(getRecentTracks(history, 5).map((event) => event.trackId), ['a', 'b']);

const calendar = getCalendar(history, lookup, 2, now);
assert.equal(calendar.columns.length, 2);
assert.equal(calendar.columns[1][2], 190, 'Wednesday today: 180 + 10');
assert.equal(calendar.columns[1][3], null, 'future days are empty');

assert.equal(computeStats([], '30d', lookup, now).plays, 0);

// Genres come from the play, or else from the song in the library.
library.get('b').genre = 'Jazz';
const genres = computeStats(
  [...history, play('a', 0.5, { genre: 'Rock', listenedSeconds: 60 })],
  '7d',
  lookup,
  now,
);
assert.deepEqual(
  genres.topGenres.map((genre) => [genre.name, genre.plays]),
  [['Jazz', 2], ['Rock', 1]],
);
assert.equal(genres.genrePlays, 3, 'plays of untagged songs are left out');

// A 3-minute daily goal: met today (190s) and yesterday (200s), not 3 days ago (100s).
const goal = getGoalSummary(history, lookup, 180, now);
assert.equal(goal.todaySeconds, 190);
assert.deepEqual(goal.streaks, { current: 2, best: 2, previousBest: 1, playedToday: true });
assert.equal(goal.metDays.size, 3, 'today, yesterday and 9 days ago');
assert.equal(getGoalSummary(history, lookup, 0, now).metDays.size, 0, 'no goal, no met days');

// Saved listen time only grows, so a late or repeated save never shrinks it.
const timed = [play('a', 0, { listenedSeconds: 100 }), play('b', 1)];
const at = timed[0].playedAt;
assert.equal(withListenedSeconds(timed, at, 120.4)[0].listenedSeconds, 120, 'longer time wins');
assert.equal(withListenedSeconds(timed, at, 2), timed, 'a shorter time (two quick skips) is ignored');
assert.equal(withListenedSeconds(timed, 12345, 50), timed, 'unknown play leaves history as is');
assert.equal(withListenedSeconds(timed, timed[1].playedAt, 0)[1].listenedSeconds, 0, 'first time saved');

// More tab: groups and smart lists.
const song = (id, extra) => ({
  id, title: id, artist: null, album: null, albumArtist: null, genre: null, year: null,
  trackNumber: null, duration: 100, dateAdded: null, ...extra,
});
const shelf = [
  song('s1', { album: 'Hits', artist: 'Zed', trackNumber: 2, year: 1999, duration: 300 }),
  song('s2', { album: 'Hits', artist: 'Zed', trackNumber: 1, year: 2021 }),
  song('s3', { album: 'Hits', artist: 'Amy', year: 2021, duration: 50 }),
  song('s4', { artist: 'amy' }),
];
const albums = groupTracks(shelf, 'album');
assert.deepEqual(albums.map((g) => [g.title, g.subtitle]), [['Hits', 'Amy'], ['Hits', 'Zed'], ['Unknown album', null]],
  'same album name by two artists stays apart; untagged songs last');
assert.deepEqual(albums[1].tracks.map((t) => t.id), ['s2', 's1'], 'album songs in track order');
assert.deepEqual(groupTracks(shelf, 'year').map((g) => g.title), ['2021', '1999', 'Unknown year'], 'newest year first');
assert.equal(groupTracks(shelf, 'artist').length, 3, 'Amy and amy are separate tags, Zed, no unknown');

const ratingsFixture = { s1: 5, s2: 4, s3: 1, s4: 2 };
const listOf = (id, plays = []) => smartList(id, shelf, plays, ratingsFixture, new Set(['s3'])).tracks.map((t) => t.id);
assert.deepEqual(listOf('topRated'), ['s1', 's2']);
assert.deepEqual(listOf('lowRated'), ['s3', 's4'], 'lowest first');
assert.deepEqual(listOf('favorites'), ['s3']);
assert.deepEqual(listOf('longest').slice(0, 1), ['s1']);
const morePlays = [play('s2', 0), play('s1', 1), play('s2', 2), play('gone', 3)];
assert.deepEqual(listOf('mostPlayed', morePlays), ['s2', 's1'], 'songs no longer on the phone are skipped');
assert.deepEqual(listOf('recentlyPlayed', morePlays), ['s2', 's1'], 'one row per song, newest first');

// Mixes: only real data, and small smart mixes stay hidden.
const songs = ['a', 'b', 'c', 'd', 'e'].map((id, index) => ({ id, dateAdded: index }));
const mixPlays = [
  play('a', 1), play('a', 2), play('b', 3), play('c', 4), // played lately, a most
  play('d', 40), play('d', 41), play('e', 45), play('c', 50), // older plays
];
const mixes = new Map(getMixes(mixPlays, songs, new Set(['b']), now).map((mix) => [mix.id, mix]));
assert.deepEqual(mixes.get('repeat').tracks.map((t) => t.id), ['a', 'b', 'c'], 'ranked by recent plays');
assert.deepEqual(mixes.get('liked').tracks.map((t) => t.id), ['b']);
assert.deepEqual(mixes.get('added').tracks.map((t) => t.id), ['e', 'd', 'c', 'b', 'a'], 'newest first');
assert.equal(mixes.has('rediscover'), false, 'only d and e qualify, under the 3-song minimum');
assert.equal(mixes.has('unheard'), false, 'every song has been played');
assert.equal(mixes.get('shuffle').tracks.length, 5);
assert.equal(mixes.get('shuffle').hint, '5 songs');
// Settings: audio details, sizes and play counts.
assert.equal(
  formatAudioDetails({ mimeType: 'audio/flac', codec: 'audio/flac', bitrate: 1_411_200, sampleRate: 44_100, channels: 2 }, 'a.flac'),
  'FLAC · Lossless · 44.1 kHz · 1,411 kbps · Stereo',
);
assert.equal(formatAudioDetails({ mimeType: 'audio/mp4', codec: 'audio/mp4a-latm', bitrate: 256_000, sampleRate: 48_000, channels: 1 }, 'b.m4a'), 'AAC · 48 kHz · 256 kbps · Mono');
assert.equal(formatAudioDetails(null, 'morning-light.mp3'), 'MP3', 'falls back to the extension');
assert.equal(formatAudioDetails({ mimeType: null, codec: null, bitrate: null, sampleRate: 22_050, channels: 6 }, 'c.wav'), 'WAV · Lossless · 22.1 kHz · 6 ch');
assert.equal(formatBytes(512), '1 KB');
assert.equal(formatBytes(5 * 1024 * 1024 + 300_000), '5.3 MB');
assert.equal(formatBytes(250 * 1024 * 1024), '250 MB');
assert.equal(formatPlayCount(1), '1 play');
assert.equal(formatPlayCount(1200), '1,200 plays');

// Dynamic accent: nearest Muse hue; grey or missing covers keep the chosen one.
// The swatches as in src/theme/theme.ts.
const ACCENTS = [
  { id: 'muse', swatch: '#739B42' }, { id: 'ocean', swatch: '#4D9DD1' },
  { id: 'sunset', swatch: '#C88732' }, { id: 'rose', swatch: '#E2558A' },
  { id: 'coral', swatch: '#D56B68' }, { id: 'teal', swatch: '#4C9B91' },
  { id: 'red', swatch: '#E11D2A' },
];
assert.equal(accentForCover({ hue: 205, colorfulness: 0.4 }, 'muse', ACCENTS), 'ocean');
assert.equal(accentForCover({ hue: 95, colorfulness: 0.4 }, 'rose', ACCENTS), 'muse');
assert.equal(accentForCover({ hue: 30, colorfulness: 0.4 }, 'muse', ACCENTS), 'sunset');
assert.equal(accentForCover({ hue: 335, colorfulness: 0.4 }, 'muse', ACCENTS), 'rose');
// Coral sits at about 2 degrees: 359 is 2.6 away across 0, not 357.
assert.equal(accentForCover({ hue: 359, colorfulness: 0.4 }, 'muse', ACCENTS), 'coral', 'wraps around 0');
assert.equal(accentForCover({ hue: 352, colorfulness: 0.4 }, 'muse', ACCENTS), 'red');
assert.equal(accentForCover({ hue: 170, colorfulness: 0.4 }, 'muse', ACCENTS), 'teal');
assert.equal(accentForCover({ hue: 205, colorfulness: 0.05 }, 'rose', ACCENTS), 'rose', 'grey cover');
assert.equal(accentForCover(null, 'teal', ACCENTS), 'teal', 'no cover');

// Cover color wash: a hue alone keeps the old look; measured covers follow their colors.
assert.deepEqual(tintTones({ hue: 200 }, 'dark'), ['hsl(214, 36%, 27%)', 'hsl(200, 30%, 8%)'], 'hue only, dark');
assert.deepEqual(tintTones({ hue: 200 }, 'light'), ['hsl(214, 52%, 88%)', 'hsl(200, 30%, 79%)'], 'hue only, light');
assert.deepEqual(
  tintTones({ hue: 10, saturation: 0.5, lightness: 0.5, secondHue: 220 }, 'dark'),
  ['hsl(10, 42%, 27%)', 'hsl(220, 32%, 11%)'],
  'main color on top, second color at the bottom',
);
assert.equal(tintTones({ hue: 10, saturation: 1, lightness: 1 }, 'dark')[0], 'hsl(24, 60%, 33%)', 'vivid and bright stays readable');
assert.equal(tintTones({ hue: 10, saturation: 0, lightness: 0 }, 'dark')[0], 'hsl(24, 18%, 21%)', 'muted and dark');
assert.equal(tintTones({ hue: 359.6, saturation: 0.5 }, 'light')[1], 'hsl(0, 33%, 79%)', 'hue wraps at 360');

// A-Z index: accents fold, non-letters go under #, each letter's first row.
assert.equal(indexLetter('Émilie'), 'E');
assert.equal(indexLetter('2 Become 1'), '#');
assert.equal(indexLetter(null), '#');
assert.deepEqual(
  letterPositions(['Abba', 'ACDC', 'Beyoncé', 'björk', '808s', 'Coldplay']),
  [{ letter: 'A', index: 0 }, { letter: 'B', index: 2 }, { letter: '#', index: 4 }, { letter: 'C', index: 5 }],
);

// Lyrics: LRC stamps (several per line, header tags skipped) or plain text.
const synced = parseLyrics('[ar:Muse]\n[00:12.50]Hello\r\n[00:05.00][00:20]Chorus\n[01:02.3]Bye');
assert.equal(synced.synced, true);
assert.deepEqual(synced.lines.map((l) => [l.time, l.text]), [[5, 'Chorus'], [12.5, 'Hello'], [20, 'Chorus'], [62.3, 'Bye']]);
assert.equal(activeLyricsLine(synced.lines, 4), -1, 'before the first line');
assert.equal(activeLyricsLine(synced.lines, 12.5), 1);
assert.equal(activeLyricsLine(synced.lines, 99), 3);
const plain = parseLyrics('\nLine one\nLine two\n\n\n\nVerse two\n\n');
assert.equal(plain.synced, false);
assert.deepEqual(plain.lines.map((l) => l.text), ['Line one', 'Line two', '', 'Verse two']);

// Saved stores: a change made while loading must not erase what was saved.
const fakeStorage = (saved, { failRead = false } = {}) => {
  const writes = [];
  return {
    writes,
    getItem: () => (failRead ? Promise.reject(new Error('disk')) : Promise.resolve(saved)),
    setItem: (key, value) => {
      writes.push(value);
      return Promise.resolve();
    },
  };
};
const ratingsDisk = fakeStorage(JSON.stringify({ old: 5 }));
const ratingStore = createSavedStore(ratingsDisk, 'k', {}, (value) => value);
ratingStore.update((value) => ({ ...value, early: 3 })); // tapped before the load finished
await ratingStore.ready;
assert.deepEqual(ratingStore.get(), { old: 5, early: 3 }, 'early change replayed on the saved copy');
assert.deepEqual(ratingsDisk.writes.map((w) => JSON.parse(w)), [{ old: 5, early: 3 }], 'saved once, merged');
ratingStore.update((value) => ({ ...value, late: 1 }));
assert.deepEqual(JSON.parse(ratingsDisk.writes.at(-1)), { old: 5, early: 3, late: 1 });

const brokenDisk = fakeStorage(null, { failRead: true });
const brokenStore = createSavedStore(brokenDisk, 'k', {}, (value) => value);
brokenStore.update((value) => ({ ...value, early: 3 }));
await brokenStore.ready;
assert.equal(brokenDisk.writes.length, 0, 'an unreadable copy is never overwritten by early changes');
brokenStore.update((value) => ({ ...value, later: 1 }));
assert.equal(brokenDisk.writes.length, 0, 'nor by changes made after the failed read');
const corruptDisk = fakeStorage('{not json');
const corruptStore = createSavedStore(corruptDisk, 'k', {}, (value) => value);
await corruptStore.ready;
corruptStore.update((value) => ({ ...value, fresh: 1 }));
assert.deepEqual(JSON.parse(corruptDisk.writes.at(-1)), { fresh: 1 }, 'corrupt text does not block saving');

// Search: accents, ranking, untagged groups and the top result.
const searchSong = (id, title, artist, album = null) => ({
  id, title, artist, album, albumArtist: null, genre: null, year: null,
  filename: `${id}.mp3`, folderId: 'f', folderTitle: 'Music',
});
const searchTracks = [
  searchSong('s1', 'Halo', 'Beyoncé', 'I Am'),
  searchSong('s2', 'Love On Top', 'Beyoncé', '4'),
  searchSong('s3', 'Lovely', 'Billie Eilish'),
  searchSong('s4', 'Glove Box', null),
];
const source = {
  tracks: searchTracks,
  artists: groupTracks(searchTracks, 'artist'),
  albums: groupTracks(searchTracks, 'album'),
  genres: groupTracks(searchTracks, 'genre'),
  playlists: [{ id: 'p', name: 'Love songs', trackIds: [], coverUri: null, coverTrackId: null, createdAt: 0 }],
  folders: [{ id: 'f', title: 'Music', trackCount: 4 }],
};
assert.equal(matchScore('Love On Top', 'love'), 3);
assert.equal(matchScore('Glove Box', 'love'), 1, 'inside a word ranks lowest');
const bey = searchLibrary('beyonce', source);
assert.equal(bey.top.kind, 'artist', 'accents ignored, artist beats their songs');
assert.deepEqual(bey.songs.map((t) => t.id), ['s1', 's2'], 'songs found through their artist');
const love = searchLibrary('love', source);
assert.deepEqual(love.songs.map((t) => t.id), ['s2', 's3', 's4'], 'starts-with ranks above contains');
assert.equal(love.top.kind, 'playlist', 'on a tie the playlist wins over a song');
assert.equal(searchLibrary('unknown', source).artists.length, 0, 'untagged group is never a result');
assert.equal(searchLibrary('   ', source).top, null);

// Library filter: every word must match, in any field.
assert.deepEqual(searchWords('  Beyoncé   Halo '), ['beyonce', 'halo']);
assert.deepEqual(searchWords('   '), []);
const indexed = normalizeSearch(['Views', 'Drake', 'Views (Deluxe)', 'drake-views'].join(' '));
assert.ok(matchesAllWords(indexed, searchWords('drake views')), 'words can come from different fields');
assert.ok(matchesAllWords(indexed, searchWords('VIEWS drake')), 'order and case do not matter');
assert.ok(!matchesAllWords(indexed, searchWords('drake halo')), 'every word must match');

{
// Short words must start a word; 3+ letters may match inside one.
assert.ok(matchesAllWords('arthur', ['ar']));
assert.ok(!matchesAllWords('heart', ['ar']), '2 letters do not match inside a word');
assert.ok(matchesAllWords('heart', ['ear']), '3 letters do');
assert.ok(matchesAllWords('love on top', ['on']), 'a later word counts');

// Highlights map back through accents and capitals.
assert.deepEqual(matchRanges('Beyoncé', ['beyonce']), [[0, 7]]);
assert.deepEqual(matchRanges('Love On Top', ['on', 'love']), [[0, 4], [5, 7]]);
assert.deepEqual(matchRanges('Heart', ['ar']), [], 'same word-start rule as matching');
assert.deepEqual(matchRanges('Glove', ['love', 'ove']), [[1, 5]], 'overlaps merge');

// The index skips the folder path and file extension.
const indexedTrack = {
  id: 't', title: 'Halo', artist: null, album: null, albumArtist: null,
  filename: 'rare-mix.mp3', path: 'Music/Downloads/rare-mix.mp3', folderTitle: 'Downloads',
};
const songIndex = buildSearchIndex([indexedTrack]).get('t');
assert.ok(!songIndex.includes('music') && !songIndex.includes('mp3'), 'no path, no extension');
assert.ok(songIndex.includes('rare-mix') && songIndex.includes('downloads'));

// Why a song matched when its row does not show it.
const tagged = { ...indexedTrack, artist: 'Beyoncé', album: 'I Am' };
assert.equal(hiddenMatch(tagged, ['halo']), null, 'the title explains it');
assert.deepEqual(hiddenMatch(tagged, ['rare']), { label: 'File', value: 'rare-mix' });
assert.deepEqual(hiddenMatch(tagged, ['downloads']), { label: 'Folder', value: 'Downloads' });
assert.equal(hiddenMatch(indexedTrack, ['downloads']), null, 'untagged rows already show the folder');

// The one-pass song sort keeps the old rules.
const sortSongs = [
  { id: 'a', title: 'B song', artist: 'Zed', year: null, path: 'a', duration: 10, dateAdded: 5 },
  { id: 'b', title: 'A song', artist: null, year: 2020, path: 'b', duration: 30, dateAdded: undefined },
  { id: 'c', title: 'C song', artist: 'Abe', year: 2019, path: 'c', duration: 20, dateAdded: 9 },
];
const ids = (list) => list.map((song) => song.id).join('');
assert.equal(ids(sortMusicTracks(sortSongs, 'title', 'ascending')), 'bac');
assert.equal(ids(sortMusicTracks(sortSongs, 'artist', 'ascending')), 'cab', 'no artist goes last');
assert.equal(ids(sortMusicTracks(sortSongs, 'artist', 'descending')), 'acb', 'still last when reversed');
assert.equal(ids(sortMusicTracks(sortSongs, 'year', 'descending')), 'bca');
assert.equal(ids(sortMusicTracks(sortSongs, 'dateAdded', 'descending')), 'cab', 'missing date goes last');
assert.equal(ids(sortMusicTracks(sortSongs, 'duration', 'ascending')), 'acb');
// Sort keys: numbers by value, accents and case ignored.
const named = (...names) => names.map((title, index) => ({ id: String(index), title, path: '' }));
const order = (list) => sortMusicTracks(list, 'title', 'ascending').map((song) => song.title).join(',');
assert.equal(order(named('Track 10', 'Track 2', 'track 1')), 'track 1,Track 2,Track 10');
assert.equal(order(named('Fox', 'Émile', 'ed')), 'ed,Émile,Fox');
assert.equal(order(named('007', '7a', '10')), '007,7a,10');

// Albums and artists sort; the untagged group stays last.
const groupSongs = [
  { id: '1', title: 's1', album: 'Zulu', artist: 'Amy', albumArtist: null, year: 2001, dateAdded: 100, trackNumber: 1 },
  { id: '2', title: 's2', album: 'Alpha', artist: 'Bo', albumArtist: null, year: 2010, dateAdded: 50, trackNumber: 1 },
  { id: '3', title: 's3', album: 'Alpha', artist: 'Bo', albumArtist: null, year: 2012, dateAdded: 60, trackNumber: 2 },
  { id: '4', title: 's4', album: null, artist: null, albumArtist: null, year: 2030, dateAdded: 999, trackNumber: null },
];
const albums = groupTracks(groupSongs, 'album');
const titles = (list) => list.map((group) => group.title).join(',');
assert.equal(titles(sortGroups(albums, 'name', 'descending')), 'Zulu,Alpha,Unknown album');
assert.equal(titles(sortGroups(albums, 'year', 'descending')), 'Alpha,Zulu,Unknown album', 'newest song year');
assert.equal(titles(sortGroups(albums, 'dateAdded', 'descending')), 'Zulu,Alpha,Unknown album');
assert.equal(titles(sortGroups(albums, 'artist', 'ascending')), 'Zulu,Alpha,Unknown album');
const artists = groupTracks(groupSongs, 'artist');
assert.equal(titles(sortGroups(artists, 'songCount', 'descending')), 'Bo,Amy,Unknown artist');

}

// Calendar week from the chosen start day; same-days comparison.
{
  const sat = getWeek(history, lookup, 6, now); // Wed 4 Nov: week is Sat 31 Oct – Fri 6 Nov
  assert.equal(new Date(sat.start).getDay(), 6);
  assert.equal(new Date(sat.start).getDate(), 31);
  assert.equal(sat.seconds, 100 + 200 + 190, 'Sun b, Tue a, today a + skipped b');
  assert.equal(sat.days[5].seconds, null, 'Thursday is still to come');
  assert.equal(sat.previousSeconds, 200, 'only Sat–Wed of last week counts');
  const mon = getWeek(history, lookup, 1, now);
  assert.equal(new Date(mon.start).getDate(), 2);
  assert.equal(mon.seconds, 200 + 190);
  // computeStats' calendar week: all 7 days bucketed, previous = same days last week.
  const thisWeek = computeStats(history, 'week', lookup, now, 6);
  assert.equal(thisWeek.buckets.length, 7, 'future days are still shown');
  assert.equal(thisWeek.seconds, 490);
  assert.equal(thisWeek.dayCount, 5, 'Sat to Wed so far');
  assert.equal(thisWeek.previous.seconds, 200);
  // A past week, as the recap asks for it: pass its last day as now.
  const lastWeek = computeStats(history, 'week', lookup, now - 6 * DAY, 6); // Thu 29 Oct
  assert.equal(new Date(lastWeek.buckets[0].key).getDate(), 24, 'week of Sat 24 Oct');
  assert.equal(lastWeek.seconds, 200, 'the Monday 26 Oct play');
}

// Pulse board: saved layouts are cleaned up; squares pair without holes.
{
  const ids = (rows) => rows.map((row) => row.map((item) => item.id).join('+')).join(' / ');
  assert.equal(ids(packRows(DEFAULT_PULSE.board)), 'recap / mixes / jump / week / goal+streak / artist+hour / repeat / album+session / genre+explore');
  const sq = (id) => ({ id, on: true, size: 'square' });
  assert.equal(ids(packRows([sq('goal'), { id: 'week', on: true, size: 'wide' }, sq('streak')])), 'goal+streak / week');
  assert.equal(ids(packRows([sq('goal'), { ...sq('streak'), on: false }])), 'goal', 'hidden widgets take no space');
  const parsed = parsePulse({ board: [{ id: 'gone', on: true }, { id: 'goal', on: false, size: 'wide' }], weekStart: 3 });
  assert.equal(parsed.weekStart, 6, 'unknown week start falls back to Saturday');
  assert.equal(parsed.board.length, DEFAULT_PULSE.board.length, 'missing widgets come back');
  const goal = parsed.board.find((item) => item.id === 'goal');
  assert.deepEqual([goal.on, goal.size], [false, 'square'], 'kept hidden; goal cannot be wide');
  assert.equal(parsed.board[0].id, 'recap', 'missing widgets return to their default place');
  assert.deepEqual([parsed.recapSeen, parsed.recapOpen, parsed.goalCelebrated], [null, null, null]);
}

// Home sections: a shelf moved among the numbers still shows with the music; each group keeps its own order.
{
  const mixed = parsePulse({ board: [{ id: 'goal' }, { id: 'mixes' }, { id: 'artist' }, { id: 'week' }, { id: 'explore' }] });
  const sections = groupBoard(mixed.board);
  assert.deepEqual(sections.map((section) => section.group.id), ['music', 'today', 'month', 'library']);
  assert.ok(sections[0].items.some((item) => item.id === 'mixes'), 'Mixes stays a music shelf');
  const today = sections[1].items.map((item) => item.id);
  assert.ok(today.indexOf('goal') < today.indexOf('week'), 'saved order inside a group');
  assert.equal(sections.flatMap((section) => section.items).length, DEFAULT_PULSE.board.length, 'nothing lost');
}

// Change cover: search words, both services' answers, one list without repeats.
assert.equal(coverQuery({ title: 'Song', artist: 'Nora Vale', album: 'Glass Harbor' }), 'Nora Vale Glass Harbor');
assert.equal(coverQuery({ title: 'Song', artist: null, album: null }), 'Song', 'no album: the title');
{
  const apple = parseApple({
    results: [
      { collectionName: 'Glass Harbor', artworkUrl100: 'https://is1.mzstatic.com/image/thumb/a/b.jpg/100x100bb.jpg' },
      { collectionName: 'No art' },
      { collectionName: 'Odd link', artworkUrl100: 'https://example.com/cover.jpg' },
    ],
  });
  assert.equal(apple.length, 1, 'results without a sizable link are skipped');
  assert.equal(apple[0].full, 'https://is1.mzstatic.com/image/thumb/a/b.jpg/3000x3000bb.jpg', 'the biggest Apple has');
  assert.equal(apple[0].preview, 'https://is1.mzstatic.com/image/thumb/a/b.jpg/300x300bb.jpg');
  const deezer = parseDeezer({
    data: [
      {
        title: 'Glass Harbor',
        cover_medium: 'https://cdn.dz/images/cover/x/250x250-000000-80-0-0.jpg',
        cover_xl: 'https://cdn.dz/images/cover/x/1000x1000-000000-80-0-0.jpg',
      },
    ],
  });
  assert.equal(deezer[0].full, 'https://cdn.dz/images/cover/x/1800x1800-000000-100-0-0.jpg', 'the biggest Deezer serves');
  assert.deepEqual(parseApple(null), []);
  assert.deepEqual(parseDeezer({ error: 'quota' }), []);
  const merged = mergeCovers([apple[0], { ...apple[0], id: 'same picture' }], deezer);
  assert.deepEqual(merged.map((cover) => cover.source), ['Apple Music', 'Deezer'], 'takes turns, repeats dropped');
}
// Cover search: file-name noise goes, "Artist - Title" splits, the real album outranks remakes and compilations.
assert.equal(cleanWords('01 - Coldplay - Yellow (Official Video) [320kbps]'), 'Coldplay - Yellow');
assert.equal(cleanWords('03_Tum_Hi_Ho_www.songs.pk.mp3'), 'Tum Hi Ho');
assert.deepEqual(splitArtistTitle('01 - Coldplay - Yellow (Official Video)'), { artist: 'Coldplay', title: 'Yellow' });
assert.equal(splitArtistTitle('Yellow'), null);
assert.equal(cleanWords('99 Problems'), '99 Problems', 'a number that is the title stays');
assert.equal(coverQuery({ title: '01 - Coldplay - Yellow (Lyrics)', artist: null, album: null }), 'Coldplay Yellow', 'untagged: words from the file name');
{
  const art = (n) => `https://is1.mzstatic.com/image/thumb/${n}/100x100bb.jpg`;
  const song = { title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', duration: 355 };
  const real = { id: 'a', name: 'A Night At The Opera', artist: 'Queen', title: 'Bohemian Rhapsody', seconds: 354, preview: art(1), full: art(1), source: 'Deezer' };
  const best = { ...real, id: 'b', name: 'Greatest Hits', preview: art(2), full: art(2) };
  const piano = { ...real, id: 'c', name: 'Queen Piano Tribute', artist: 'Piano Dreamers', preview: art(3), full: art(3) };
  const live = { ...real, id: 'd', name: 'Live Killers', title: 'Bohemian Rhapsody (Live)', seconds: 420, preview: art(4), full: art(4) };
  const twin = { ...real, id: 'e', source: 'Apple Music', preview: art(5), full: art(5) };
  const ranked = rankCovers([piano, live, best, real, twin], song);
  assert.equal(ranked[0].name, 'A Night At The Opera', 'the tagged album first');
  assert.ok(scoreCover(best, song) > scoreCover(piano, song), 'a compilation by the artist beats a piano tribute');
  assert.ok(scoreCover(best, song) > scoreCover(live, song), 'the same length beats a live take');
  assert.equal(ranked.filter((cover) => cover.name === 'A Night At The Opera').length, 1, 'one tile per album');
  assert.ok(scoreCover({ ...piano, artist: 'Queen' }, { ...song, title: 'Bohemian Rhapsody (Piano Version)' }) > 0, 'a remake you own is not pushed down');
}

// The hold ring: its length is the dash, so it must match the shape it draws.
assert.equal(ringPath(100, 0, 0, 3).length, 400, 'square: four sides');
assert.ok(Math.abs(ringPath(100, 50, 0, 3).length - Math.PI * 100) < 1e-9, 'round (vinyl): a circle');
assert.equal(ringPath(100, 10, 5, 3).box, 116, 'room for the ring outside the cover');
assert.equal(ringPath(100, 0, -10, 3).extent, 3, 'inside ring: no room needed outside');

// Minimal type: as big as fits (each word on one line, three lines at most), on a 360 dp phone (312 wide).
assert.equal(minimalTitleSize('Hello', 312), 72, 'a short title is a poster');
assert.equal(minimalTitleSize('Blinding Lights', 312), 56, '"Blinding" is too wide at 72');
assert.equal(minimalTitleSize('Blinding Lights', 312, 40), 40, 'short phones cap the size');
assert.equal(minimalTitleSize('The Less I Know The Better Than You Ever Will', 312), 32, 'a long title steps down');
assert.equal(minimalTitleSize('Supercalifragilisticexpialidocious', 312), 32, 'nothing fits: smallest size');
assert.equal(minimalTitleSize('Lights', 312), 72);
assert.equal(minimalTitleSize('Lights', 312 / 1.3), 56, 'big system text means a smaller step');
assert.deepEqual(minimalLabels({ genre: 'Pop', year: 2020 }, 3, 28), ['SONG 4 OF 28', 'POP · 2020']);
assert.deepEqual(minimalLabels({ genre: null, year: null }, 0, 1), ['', '']);

// Sleep timer: one width all the way down, so the player bar never shifts.
assert.deepEqual([3600, 600, 599, 61, 0].map(formatSleepTimer), ['60:00', '10:00', '09:59', '01:01', '00:00']);

console.log('stats checks passed');

// Play next / Add to queue: right after the current song or at the end; a song
// already coming up moves instead of playing twice; what played stays put.
{
  const t = (id) => ({ id });
  const ids = (list) => list.map((track) => track.id).join('');
  const queue = ['a', 'b', 'c', 'd', 'e'].map(t);
  assert.equal(ids(withQueued(queue, 1, [t('x')], 'next')), 'abxcde');
  assert.equal(ids(withQueued(queue, 1, [t('x')], 'end')), 'abcdex');
  assert.equal(ids(withQueued(queue, 1, [t('d')], 'next')), 'abdce');
  assert.equal(ids(withQueued(queue, 1, [t('c')], 'end')), 'abdec');
  assert.equal(ids(withQueued(queue, 3, [t('a')], 'next')), 'abcdae', 'played songs are not moved');
  assert.equal(ids(withQueued(queue, 4, [t('x'), t('y')], 'next')), 'abcdexy');
}
console.log('queue order checks passed');

// Settings › Check for updates: which GitHub release counts as newer.
{
  const { isNewer } = await import('../src/settings/updates.ts');
  assert.equal(isNewer('v1.1', '1.0'), true);
  assert.equal(isNewer('1.0.0', '1.0'), false, 'same version, different length');
  assert.equal(isNewer('v1.0.1', '1.0'), true);
  assert.equal(isNewer('0.9.9', '1.0'), false);
  assert.equal(isNewer('v2', '1.10'), true);
  assert.equal(isNewer('1.10', '1.9'), true, 'numbers, not text');

  // Release notes: Markdown to plain bullets for the update sheet.
  const { releaseNotes } = await import('../src/settings/updates.ts');
  assert.equal(
    releaseNotes("## What's new\r\n\r\n\r\n- **Hi-Res** badge\n* See [the docs](https://x.y) for `more`\n"),
    "## What's new\n\n• Hi-Res badge\n• See the docs for more",
    'headings stay, so the sheet can group changes',
  );
  const { shortVersion } = await import('../src/settings/updates.ts');
  assert.equal(shortVersion('1.1.0'), '1.1');
  assert.equal(shortVersion('v2.0.0'), '2.0');
  assert.equal(shortVersion('1.0.1'), '1.0.1', 'a real patch number stays');
  assert.equal(shortVersion('1.10'), '1.10');
  assert.equal(releaseNotes('one\ntwo\nthree', 8), 'one\ntwo\n…', 'cut at a line');
  const { whatsNew } = await import('../src/settings/updates.ts');
  assert.equal(
    whatsNew('A small update.\n\n- Faster covers\n\n**Install:** download the APK.\n\nMuse is free for everyone.'),
    'A small update.\n\n- Faster covers',
    'install steps and license lines stay on GitHub',
  );
  assert.equal(whatsNew('- One change'), '- One change', 'no install line: all of it');
  assert.equal(releaseNotes(''), '');
}
console.log('update checks passed');

// Onboarding › Surprise me: funky names fit the name limit and never repeat back to back.
{
  const { funkyName, FUNKY_WORDS } = await import('../src/settings/funkyNames.ts');
  for (const adjective of FUNKY_WORDS.ADJECTIVES) {
    for (const noun of FUNKY_WORDS.NOUNS) assert.ok(`${adjective} ${noun}`.length <= 24, `${adjective} ${noun}`);
  }
  assert.notEqual(funkyName('Velvet Bassline', () => 0), 'Velvet Bassline', 'a stuck random still changes the name');
  assert.match(funkyName(), /^\S+ \S+$/);
}
console.log('funky name checks passed');

// Backups: ASCII-only text, and songs matched across phones by path.
{
  const { ascii, relativePath, songIdMap, swapSongIds } = await import('../src/settings/backupFormat.ts');
  const text = JSON.stringify({ title: 'আমার গান 😀', plain: 'ok' });
  assert.match(ascii(text), /^[\x00-\x7e]*$/, 'every character is ASCII');
  assert.deepEqual(JSON.parse(ascii(text)), JSON.parse(text), 'escapes read back the same');
  assert.equal(relativePath('/storage/emulated/0/Music/a.mp3'), 'Music/a.mp3');
  assert.equal(relativePath('/storage/1A2B-3C4D/Music/a.mp3'), 'Music/a.mp3', 'SD card volume dropped');

  // Old phone: 1 = Music/a, 2 = Music/b, 3 = Music/c. New phone: a is 2, b is 9, c is missing and 3 is another song.
  const ids = songIdMap(
    { 1: 'Music/a.mp3', 2: 'Music/b.mp3', 3: 'Music/c.mp3', 4: 'Music/d.mp3' },
    [
      { id: '2', path: '/storage/emulated/0/Music/a.mp3' },
      { id: '9', path: '/storage/emulated/0/Music/b.mp3' },
      { id: '3', path: '/storage/emulated/0/Music/other.mp3' },
    ],
  );
  assert.deepEqual([...ids], [['1', '2'], ['2', '9'], ['3', 'gone:3']], 'unmatched 4 is left alone');
  assert.equal(
    swapSongIds('{"favorites":["1","2","3","4"],"2":5,"name":"x"}', ids),
    '{"favorites":["2","9","gone:3","4"],"9":5,"name":"x"}',
    'one pass: 1 becomes 2 and is not then swapped again to 9',
  );
  assert.equal(swapSongIds('["1"]', new Map()), '["1"]');
  assert.equal(songIdMap(undefined, []).size, 0);
}
console.log('backup checks passed');

// Widgets: saved minutes from an earlier day start again at 0 with Muse closed.
{
  const { freshForToday, localDay } = await import('../src/widgets/today.ts');
  const at = new Date(2026, 10, 12, 0, 30);
  assert.equal(localDay(0, at), '2026-11-12');
  assert.equal(localDay(1, new Date(2026, 0, 1)), '2025-12-31', 'across the year');
  const saved = { todayMinutes: 42, streak: 5, day: '2026-11-12' };
  assert.deepEqual(freshForToday(saved, at), saved, 'same day: unchanged');
  assert.deepEqual(freshForToday({ ...saved, day: '2026-11-11' }, at), { ...saved, day: '2026-11-11', todayMinutes: 0 }, 'yesterday: streak still alive');
  assert.equal(freshForToday({ ...saved, day: '2026-11-09' }, at).streak, 0, 'a missed day ends the streak');
  assert.deepEqual(freshForToday({ ...saved, day: '' }, at), { ...saved, day: '' }, 'older saves without a day are left alone');
}
console.log('widget checks passed');

// The notices Settings shows match the repo's file.
{
  const { readFileSync } = await import('node:fs');
  const { THIRD_PARTY_NOTICES } = await import('../src/settings/notices.ts');
  const file = readFileSync(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(THIRD_PARTY_NOTICES, file.replace(/^# Third-party notices\n\n/, ''), 'src/settings/notices.ts and THIRD_PARTY_NOTICES.md differ');
}
console.log('notices checks passed');
