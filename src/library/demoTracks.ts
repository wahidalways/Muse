// Test songs for Expo Go only (see findMusic in MuseApp.tsx); real builds never
// list them. Bundled .wav files resolve to a resource name in an APK, which the
// player cannot open, so keep them out of the library on device builds.
// Recreate the files with: node scripts/make-demo-audio.js assets/demo
// Delete this file, assets/demo/ and the MuseApp.tsx import before shipping,
// so the APK does not carry the files.
import { Asset } from 'expo-asset';
import type { MusicFolder, MusicTrack } from '../types';

const GOLDEN = require('../../assets/demo/cover-golden-hour.png');
const NIGHT = require('../../assets/demo/cover-night-drive.png');
const FIELD = require('../../assets/demo/cover-field-notes.png');
const BLUE = require('../../assets/demo/cover-blue-rooms.png');
const TONES = require('../../assets/demo/cover-test-tones.png');

type Demo = {
  file: number;
  title: string;
  artist: string;
  album: string;
  year: number;
  trackNumber: number;
  genre: string;
  duration: number;
  /** Cover image. Every test song has one. */
  art: number;
  /** Days before now it was "added", so date sorts have something to order. */
  addedDaysAgo: number;
};

const DAY = 86400;
const NOW = Math.floor(Date.now() / 1000);

const DEMOS: Demo[] = [
  { file: require('../../assets/demo/demo-1.wav'), title: 'Morning Light', artist: 'Muse Demo', album: 'Test Tones', year: 2026, trackNumber: 1, genre: 'Demo', duration: 15, art: TONES, addedDaysAgo: 1 },
  { file: require('../../assets/demo/demo-2.wav'), title: 'Quiet Streets', artist: 'Muse Demo', album: 'Test Tones', year: 2026, trackNumber: 2, genre: 'Demo', duration: 15, art: TONES, addedDaysAgo: 1 },
  { file: require('../../assets/demo/demo-3.wav'), title: 'Paper Boats', artist: 'Muse Demo', album: 'Test Tones', year: 2026, trackNumber: 3, genre: 'Demo', duration: 15, art: TONES, addedDaysAgo: 1 },
  { file: require('../../assets/demo/demo-4.wav'), title: 'Neon River', artist: 'Muse Demo', album: 'Test Tones', year: 2026, trackNumber: 4, genre: 'Demo', duration: 15, art: TONES, addedDaysAgo: 1 },
  { file: require('../../assets/demo/demo-5.wav'), title: 'Slow Clouds', artist: 'Muse Demo', album: 'Test Tones', year: 2026, trackNumber: 5, genre: 'Demo', duration: 15, art: TONES, addedDaysAgo: 1 },
  { file: require('../../assets/demo/demo-6.wav'), title: 'Sunlit Avenue', artist: 'Lumen Coast', album: 'Golden Hour', year: 2024, trackNumber: 1, genre: 'Pop', duration: 24, art: GOLDEN, addedDaysAgo: 3 },
  { file: require('../../assets/demo/demo-7.wav'), title: 'Saltwater Hearts', artist: 'Lumen Coast', album: 'Golden Hour', year: 2024, trackNumber: 2, genre: 'Pop', duration: 31, art: GOLDEN, addedDaysAgo: 3 },
  { file: require('../../assets/demo/demo-8.wav'), title: 'Last Ferry Home', artist: 'Lumen Coast', album: 'Golden Hour', year: 2024, trackNumber: 3, genre: 'Pop', duration: 19, art: GOLDEN, addedDaysAgo: 3 },
  // Leading number and accent: checks natural and accent-aware sorting.
  { file: require('../../assets/demo/demo-9.wav'), title: '2 AM Interstate', artist: 'Velvet Static', album: 'Night Drive', year: 2023, trackNumber: 1, genre: 'Synthwave', duration: 36, art: NIGHT, addedDaysAgo: 12 },
  { file: require('../../assets/demo/demo-10.wav'), title: 'Chrome Reflections', artist: 'Velvet Static', album: 'Night Drive', year: 2023, trackNumber: 2, genre: 'Synthwave', duration: 28, art: NIGHT, addedDaysAgo: 12 },
  { file: require('../../assets/demo/demo-11.wav'), title: 'Afterglow Exit', artist: 'Velvet Static', album: 'Night Drive', year: 2023, trackNumber: 3, genre: 'Synthwave', duration: 22, art: NIGHT, addedDaysAgo: 12 },
  // Ada Rowe has two albums: checks the artist collage and "N albums".
  { file: require('../../assets/demo/demo-12.wav'), title: 'Wildflower Map', artist: 'Ada Rowe', album: 'Field Notes', year: 2021, trackNumber: 1, genre: 'Folk', duration: 33, art: FIELD, addedDaysAgo: 40 },
  { file: require('../../assets/demo/demo-13.wav'), title: 'Café Lumière', artist: 'Ada Rowe', album: 'Field Notes', year: 2021, trackNumber: 2, genre: 'Folk', duration: 26, art: FIELD, addedDaysAgo: 40 },
  { file: require('../../assets/demo/demo-14.wav'), title: 'Blue Rooms', artist: 'Ada Rowe', album: 'Blue Rooms', year: 2025, trackNumber: 1, genre: 'Jazz', duration: 21, art: BLUE, addedDaysAgo: 90 },
  { file: require('../../assets/demo/demo-15.wav'), title: 'Late Train to Lisbon', artist: 'Ada Rowe', album: 'Blue Rooms', year: 2025, trackNumber: 2, genre: 'Jazz', duration: 38, art: BLUE, addedDaysAgo: 90 },
];

export const DEMO_FOLDER: MusicFolder = { id: 'demo', title: 'Demo', trackCount: DEMOS.length };

export const DEMO_TRACKS: MusicTrack[] = DEMOS.map((demo, index) => ({
  // Not all digits, so canDeleteTrack treats them as sample songs.
  id: `demo-${index + 1}`,
  title: demo.title,
  folderId: DEMO_FOLDER.id,
  folderTitle: DEMO_FOLDER.title,
  artist: demo.artist,
  album: demo.album,
  albumArtist: demo.artist,
  year: demo.year,
  trackNumber: demo.trackNumber,
  genre: demo.genre,
  filename: `demo-${index + 1}.wav`,
  path: `Demo/demo-${index + 1}.wav`,
  uri: Asset.fromModule(demo.file).uri,
  albumArtUri: Asset.fromModule(demo.art).uri,
  dateAdded: NOW - demo.addedDaysAgo * DAY - index * 60,
  dateModified: NOW - demo.addedDaysAgo * DAY - index * 60,
  duration: demo.duration,
}));
