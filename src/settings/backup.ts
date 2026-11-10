import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Settings › App & data › Backup. One JSON file with everything Muse has
 * saved: settings, playlists, favorites, ratings, history, equalizer, folder
 * choices, and the photos picked for covers and the profile. Music files are
 * never included.
 */

/** Folders in the app's own storage that hold photos people picked. */
const PHOTO_FOLDERS = ['song-covers', 'mix-covers', 'playlist-covers', 'profile'];
/** Rebuilt from the phone on the next scan, or tied to this phone's files. */
const SKIPPED_KEYS = ['@muse/library-cache', '@muse/library-version', '@muse/playback-state'];
const FORMAT = 'muse-backup';

type BackupFile = {
  format: typeof FORMAT;
  version: 1;
  createdAt: number;
  /** Where photos lived, so their saved paths can point at the new phone's folder. */
  documentUri: string;
  stores: Record<string, string>;
  photos: { path: string; base64: string }[];
};

export type BackupSummary = {
  createdAt: number;
  playlists: number;
  favorites: number;
  ratings: number;
  listens: number;
  photos: number;
};

const isBackedUpKey = (key: string) =>
  key.startsWith('@muse/') && !SKIPPED_KEYS.some((skipped) => key.startsWith(skipped));

const countOf = (stores: Record<string, string>, key: string) => {
  try {
    const value: unknown = JSON.parse(stores[key] ?? 'null');
    if (Array.isArray(value)) {
      return value.length;
    }
    return value && typeof value === 'object' ? Object.keys(value).length : 0;
  } catch {
    return 0;
  }
};

function summarize(backup: BackupFile): BackupSummary {
  return {
    createdAt: backup.createdAt,
    playlists: countOf(backup.stores, '@muse/playlists/v1'),
    favorites: countOf(backup.stores, '@muse/favorites/v1'),
    ratings: countOf(backup.stores, '@muse/ratings/v1'),
    listens: countOf(backup.stores, '@muse/listening-history/v1'),
    photos: backup.photos.length,
  };
}

async function makeBackup(): Promise<BackupFile> {
  const keys = (await AsyncStorage.getAllKeys()).filter(isBackedUpKey);
  const stores: Record<string, string> = {};
  for (const [key, value] of await AsyncStorage.multiGet(keys)) {
    if (value !== null) {
      stores[key] = value;
    }
  }
  const photos: BackupFile['photos'] = [];
  for (const name of PHOTO_FOLDERS) {
    const folder = new Directory(Paths.document, name);
    if (!folder.exists) {
      continue;
    }
    for (const entry of folder.list()) {
      if (entry instanceof File) {
        photos.push({ path: `${name}/${entry.name}`, base64: await entry.base64() });
      }
    }
  }
  return { format: FORMAT, version: 1, createdAt: Date.now(), documentUri: Paths.document.uri, stores, photos };
}

/** Settings › App & data › Storage: bytes of photos people picked, and of listening history. */
export async function savedDataSizes(): Promise<{ photos: number; history: number }> {
  let photos = 0;
  for (const name of PHOTO_FOLDERS) {
    const folder = new Directory(Paths.document, name);
    if (folder.exists) {
      for (const entry of folder.list()) {
        photos += entry instanceof File ? (entry.size ?? 0) : 0;
      }
    }
  }
  const history = (await AsyncStorage.getItem('@muse/listening-history/v1').catch(() => null))?.length ?? 0;
  return { photos, history };
}

/** What a backup made right now would hold, for the sheet before saving. */
export async function previewBackup(): Promise<BackupSummary> {
  return summarize(await makeBackup());
}

/**
 * Asks for a folder (Downloads, Drive...) and writes the backup there.
 * Returns the file name, or null when the picker was closed.
 */
export async function saveBackup(): Promise<string | null> {
  const backup = await makeBackup();
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    // Closing the picker rejects.
    return null;
  }
  const day = new Date(backup.createdAt).toISOString().slice(0, 10);
  const name = `Muse backup ${day}.json`;
  const file = folder.createFile(name, 'application/json');
  await file.write(JSON.stringify(backup));
  return name;
}

export type PickedBackup = { summary: BackupSummary; backup: BackupFile };

/** Opens the file picker and reads a Muse backup. Null when closed; throws for other files. */
export async function pickBackup(): Promise<PickedBackup | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'application/octet-stream', 'text/plain'] });
  if (picked.canceled) {
    return null;
  }
  let backup: BackupFile;
  try {
    backup = JSON.parse(await picked.result.text()) as BackupFile;
  } catch {
    throw new Error('That file is not a Muse backup.');
  }
  if (backup?.format !== FORMAT || typeof backup.stores !== 'object' || !Array.isArray(backup.photos)) {
    throw new Error('That file is not a Muse backup.');
  }
  return { summary: summarize(backup), backup };
}

/**
 * Replaces everything Muse has saved with the backup. Muse must restart
 * afterwards: the open screens still hold the old values and would save them
 * back over the restored ones.
 */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  // Photos first, so a failure leaves the saved settings as they were.
  for (const photo of backup.photos) {
    const [folderName, fileName] = photo.path.split('/');
    if (!PHOTO_FOLDERS.includes(folderName) || !fileName || fileName.includes('..')) {
      continue;
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
  // Saved photo paths name the old phone's app folder; point them at this one.
  const here = Paths.document.uri;
  const entries = Object.entries(backup.stores)
    .filter(([key]) => isBackedUpKey(key))
    .map(([key, value]): [string, string] => [key, backup.documentUri ? value.split(backup.documentUri).join(here) : value]);
  const existing = (await AsyncStorage.getAllKeys()).filter(isBackedUpKey);
  await AsyncStorage.multiRemove(existing);
  await AsyncStorage.multiSet(entries);
}
