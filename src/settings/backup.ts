import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { LISTENING_HISTORY_KEY } from '../constants';
import { listeningHistoryBytes, listeningHistoryText, replaceListeningHistory } from '../history/history';
import type { MusicTrack } from '../types';
import { ascii, relativePath, songIdMap, swapSongIds } from './backupFormat';

/**
 * Settings › App & data › Backup. One file with everything Muse has saved:
 * settings, playlists, favorites, ratings, history, equalizer, folder
 * choices, and the photos picked for covers and the profile. Music files are
 * never included.
 *
 * Version 2 file: a first line `muse-backup 2`, then the header as one JSON
 * line, then one JSON line per photo. Photos are written and read one at a
 * time, so dozens of full-size covers never sit in memory together. Every
 * byte is ASCII (other characters are \u escapes), so it can be read in
 * pieces without a text decoder. Version 1 was one JSON object; it still
 * restores.
 */

/** Folders in the app's own storage that hold photos people picked. */
const PHOTO_FOLDERS = ['song-covers', 'mix-covers', 'playlist-covers', 'profile'];
/** Rebuilt from the phone on the next scan, tied to this phone's files, or (history) saved as a file. */
const SKIPPED_KEYS = ['@muse/library-cache', '@muse/library-version', '@muse/playback-state', LISTENING_HISTORY_KEY];
const FORMAT = 'muse-backup';
const V2_MARK = 'muse-backup 2';
/** Bytes read at a time when restoring. */
const CHUNK = 512 * 1024;

type Photo = { path: string; base64: string };

type BackupHeader = {
  format: typeof FORMAT;
  version: 1 | 2;
  createdAt: number;
  /** Where photos lived, so their saved paths can point at the new phone's folder. */
  documentUri: string;
  stores: Record<string, string>;
  /** The listening history file's text. Version 1 left it out (or kept it in stores). */
  history?: string;
  /**
   * Each song's path below its storage volume, by song id. Ids are this
   * phone's own, so a restore on another phone matches songs by path.
   */
  paths?: Record<string, string>;
  /** Version 2: how many photo lines follow the header. */
  photoCount?: number;
  /** Version 1: the photos, inside the one JSON object. */
  photos?: Photo[];
};

export type BackupSummary = {
  createdAt: number;
  playlists: number;
  favorites: number;
  ratings: number;
  listens: number;
  photos: number;
};

export type PickedBackup = { summary: BackupSummary; header: BackupHeader; file: File };

const isBackedUpKey = (key: string) =>
  key.startsWith('@muse/') && !SKIPPED_KEYS.some((skipped) => key.startsWith(skipped));

/** Items in a saved JSON list or object; 0 when missing or unreadable. */
const countOf = (text: string | undefined) => {
  try {
    const value: unknown = JSON.parse(text ?? 'null');
    if (Array.isArray(value)) {
      return value.length;
    }
    return value && typeof value === 'object' ? Object.keys(value).length : 0;
  } catch {
    return 0;
  }
};

/** Version 1 backups kept history in stores, under the old key. */
const historyOf = (header: BackupHeader) => header.history ?? header.stores[LISTENING_HISTORY_KEY];

function summarize(header: BackupHeader): BackupSummary {
  return {
    createdAt: header.createdAt,
    playlists: countOf(header.stores['@muse/playlists/v1']),
    favorites: countOf(header.stores['@muse/favorites/v1']),
    ratings: countOf(header.stores['@muse/ratings/v1']),
    listens: countOf(historyOf(header)),
    photos: header.photoCount ?? header.photos?.length ?? 0,
  };
}

function photoFiles(): { path: string; file: File }[] {
  return PHOTO_FOLDERS.flatMap((name) => {
    const folder = new Directory(Paths.document, name);
    if (!folder.exists) {
      return [];
    }
    return folder.list().flatMap((entry) => (entry instanceof File ? [{ path: `${name}/${entry.name}`, file: entry }] : []));
  });
}

async function makeHeader(tracks: readonly MusicTrack[], photoCount: number): Promise<BackupHeader> {
  const keys = (await AsyncStorage.getAllKeys()).filter(isBackedUpKey);
  const stores: Record<string, string> = {};
  for (const [key, value] of await AsyncStorage.multiGet(keys)) {
    if (value !== null) {
      stores[key] = value;
    }
  }
  const history = await listeningHistoryText();
  return {
    format: FORMAT,
    version: 2,
    createdAt: Date.now(),
    documentUri: Paths.document.uri,
    stores,
    ...(history !== null ? { history } : {}),
    paths: Object.fromEntries(tracks.map((track) => [track.id, relativePath(track.path)])),
    photoCount,
  };
}

/** Settings › App & data › Storage: bytes of photos people picked, and of listening history. */
export async function savedDataSizes(): Promise<{ photos: number; history: number }> {
  const photos = photoFiles().reduce((total, { file }) => total + file.size, 0);
  return { photos, history: listeningHistoryBytes() };
}

/** What a backup made right now would hold, for the sheet before saving. Photos are counted, not read. */
export async function previewBackup(tracks: readonly MusicTrack[]): Promise<BackupSummary> {
  return summarize(await makeHeader(tracks, photoFiles().length));
}

/**
 * Asks for a folder (Downloads, Drive...) and writes the backup there.
 * Returns the file name, or null when the picker was closed.
 */
export async function saveBackup(tracks: readonly MusicTrack[]): Promise<string | null> {
  const photos = photoFiles();
  const header = await makeHeader(tracks, photos.length);
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    // Closing the picker rejects.
    return null;
  }
  const day = new Date(header.createdAt).toISOString().slice(0, 10);
  const name = `Muse backup ${day}.json`;
  const file = folder.createFile(name, 'application/json');
  await file.write(`${V2_MARK}\n${ascii(JSON.stringify(header))}\n`);
  for (const photo of photos) {
    const line = JSON.stringify({ path: photo.path, base64: await photo.file.base64() } satisfies Photo);
    await file.write(`${ascii(line)}\n`, { append: true });
  }
  return name;
}

/** Reads an ASCII file one line at a time. `next` gives null at the end. */
function lineReader(file: File) {
  const handle = file.open();
  let rest = '';
  let isDone = false;
  return {
    async next(): Promise<string | null> {
      for (;;) {
        const end = rest.indexOf('\n');
        if (end >= 0) {
          const line = rest.slice(0, end);
          rest = rest.slice(end + 1);
          return line;
        }
        if (isDone) {
          const line = rest;
          rest = '';
          return line === '' ? null : line;
        }
        const bytes = await handle.readBytes(CHUNK);
        if (bytes.length === 0) {
          isDone = true;
          continue;
        }
        // In slices: too many arguments at once overflows the stack.
        for (let i = 0; i < bytes.length; i += 4096) {
          rest += String.fromCharCode(...bytes.subarray(i, i + 4096));
        }
      }
    },
    close: () => handle.close(),
  };
}

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((item) => typeof item === 'string');

function isBackupHeader(value: unknown): value is BackupHeader {
  const header = value as BackupHeader | null;
  return (
    header?.format === FORMAT &&
    (header.version === 1 || header.version === 2) &&
    typeof header.createdAt === 'number' &&
    isStringRecord(header.stores) &&
    (header.history === undefined || typeof header.history === 'string') &&
    (header.paths === undefined || isStringRecord(header.paths)) &&
    (header.version === 2 ? typeof header.photoCount === 'number' : Array.isArray(header.photos))
  );
}

/** Opens the file picker and reads a Muse backup's header. Null when closed; throws for other files. */
export async function pickBackup(): Promise<PickedBackup | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'application/octet-stream', 'text/plain'] });
  if (picked.canceled) {
    return null;
  }
  const file = picked.result;
  let header: unknown;
  try {
    // Version 1 is one JSON object on one line, so peek rather than read a line.
    const peek = file.open();
    let start = '';
    try {
      start = String.fromCharCode(...(await peek.readBytes(V2_MARK.length + 1)));
    } finally {
      peek.close();
    }
    if (start === `${V2_MARK}\n`) {
      const reader = lineReader(file);
      try {
        await reader.next();
        header = JSON.parse((await reader.next()) ?? '');
      } finally {
        reader.close();
      }
    } else {
      header = JSON.parse(await file.text());
    }
  } catch {
    throw new Error('That file is not a Muse backup.');
  }
  if (!isBackupHeader(header)) {
    throw new Error('That file is not a Muse backup.');
  }
  return { summary: summarize(header), header, file };
}

async function writePhoto(photo: Photo) {
  const [folderName, fileName] = typeof photo.path === 'string' ? photo.path.split('/') : [];
  if (!PHOTO_FOLDERS.includes(folderName) || !fileName || fileName.includes('..') || typeof photo.base64 !== 'string') {
    return;
  }
  const folder = new Directory(Paths.document, folderName);
  folder.create({ idempotent: true, intermediates: true });
  const file = new File(folder, fileName);
  if (file.exists) {
    file.delete();
  }
  file.create();
  await file.write(photo.base64, { encoding: 'base64' });
}

/**
 * Replaces everything Muse has saved with the backup. Muse must restart
 * afterwards: the open screens still hold the old values and would save them
 * back over the restored ones. `tracks` is this phone's library, to match
 * the backup's songs by path.
 */
export async function restoreBackup({ header, file }: PickedBackup, tracks: readonly MusicTrack[]): Promise<void> {
  // Photos first, so a failure leaves the saved settings as they were.
  if (header.photos) {
    for (const photo of header.photos) {
      await writePhoto(photo);
    }
  } else {
    const reader = lineReader(file);
    try {
      // The mark and the header.
      await reader.next();
      await reader.next();
      for (let line = await reader.next(); line !== null; line = await reader.next()) {
        if (line !== '') {
          await writePhoto(JSON.parse(line) as Photo);
        }
      }
    } finally {
      reader.close();
    }
  }
  const here = Paths.document.uri;
  const songIds = songIdMap(header.paths, tracks);
  // Saved photo paths name the old phone's app folder; point them at this one.
  const adapt = (text: string) =>
    swapSongIds(header.documentUri ? text.split(header.documentUri).join(here) : text, songIds);
  const entries = Object.entries(header.stores)
    .filter(([key]) => isBackedUpKey(key))
    .map(([key, value]): [string, string] => [key, adapt(value)]);
  // Written before the old keys go, so a failure part way never leaves nothing saved.
  await AsyncStorage.multiSet(entries);
  const restored = new Set(entries.map(([key]) => key));
  const leftover = (await AsyncStorage.getAllKeys()).filter((key) => isBackedUpKey(key) && !restored.has(key));
  await AsyncStorage.multiRemove(leftover);
  const history = historyOf(header);
  // A backup without history keeps this phone's: nothing to replace it with.
  if (history !== undefined) {
    await replaceListeningHistory(adapt(history));
  }
}
