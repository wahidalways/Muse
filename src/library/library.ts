import { isRunningInExpoGo } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { Asset } from 'expo-media-library';
import { Platform } from 'react-native';
import { getAudioLibrary } from '../../modules/muse-audio-metadata';
import { filesSupported, trashTracks } from '../../modules/muse-audio-metadata/files';
import { sortMusicTracks } from './sortTracks';
import type { MusicTrack, CachedLibrary, LibraryView, MusicFolder } from '../types';
import {
  DEFAULT_LIBRARY_VIEW,
  LEGACY_LIBRARY_CACHE_FILE_NAMES,
  LEGACY_LIBRARY_CACHE_KEYS,
  LIBRARY_CACHE_FILE_NAME,
  LIBRARY_SORT_OPTIONS,
  TABS,
} from '../constants';

/** Saved state only exists on a real Android build. */
export function canRestoreSavedLibrary(): boolean {
  return Platform.OS === 'android' && !isRunningInExpoGo();
}

/** Scans the device in one native call and groups songs into folders. */
export async function loadMusicLibrary(): Promise<CachedLibrary> {
  const nativeTracks = await getAudioLibrary();
  const foldersById = new Map<string, MusicFolder>();
  const tracks = nativeTracks.map((item): MusicTrack => {
    const folder = foldersById.get(item.folderId);
    if (folder) {
      folder.trackCount += 1;
    } else {
      foldersById.set(item.folderId, {
        id: item.folderId,
        title: item.folderTitle,
        trackCount: 1,
      });
    }
    const folderPath = item.directory?.trim() || item.folderTitle;
    return {
      id: item.id,
      title: item.title?.trim() || item.filename.replace(/\.[^/.]+$/, ''),
      folderId: item.folderId,
      folderTitle: item.folderTitle,
      artist: item.artist?.trim() || null,
      album: item.album?.trim() || null,
      albumArtist: item.albumArtist?.trim() || null,
      year: item.year,
      trackNumber: item.trackNumber,
      // Tags can hold several genres. Keep the first so each song counts once.
      genre: item.genre?.split(/[;\u0000]/)[0]?.trim() || null,
      filename: item.filename,
      path: `${folderPath}${folderPath.endsWith('/') ? '' : '/'}${item.filename}`,
      uri: item.uri,
      albumArtUri: item.albumArtUri,
      dateAdded: item.dateAdded,
      dateModified: item.dateModified ?? null,
      duration: item.duration ?? 0,
    };
  });

  return {
    folders: [...foldersById.values()].sort((first, second) =>
      first.title.localeCompare(second.title),
    ),
    // Folder by folder, then by file name. This is also the order songs
    // follow after the one you tap.
    tracks: sortMusicTracks(tracks, 'path', 'ascending'),
  };
}

/** Only real files from the phone (media ids, or picked-folder "doc-" ids) can be deleted. */
export function canDeleteTrack(track: MusicTrack): boolean {
  return /^\d+$/.test(track.id) || track.id.startsWith('doc-');
}

/**
 * Moves songs' files to Android's trash (restorable from the Files app for
 * 30 days), behind one Android confirm dialog. Files from picked folders have
 * no trash and are deleted. Resolves false when the person says no there.
 *
 * Android 10 and older would need the storage write permission, which Muse
 * blocks on purpose, so deleting is offered from Android 11 on.
 */
export async function deleteTrackFiles(tracks: MusicTrack[]): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 30) {
    throw new Error('Deleting songs needs Android 11 or newer.');
  }
  if (filesSupported) {
    return trashTracks(tracks.map((track) => track.id));
  }
  try {
    // Same id as Muse's own scan: the media store row for the file.
    await Asset.delete(tracks.map((track) => new Asset(`content://media/external/audio/media/${track.id}`)));
    return true;
  } catch (error) {
    // Saying no in Android's dialog arrives as a permission error.
    if (error instanceof Error && /permission/i.test(error.message)) {
      return false;
    }
    throw error;
  }
}

/**
 * The scanned library is kept in a JSON file, not AsyncStorage. On Android,
 * AsyncStorage keeps each value in one SQLite row and cannot read a row over
 * about 2 MB, which a library of a few thousand songs would pass.
 */
function libraryCacheFile(): File {
  return new File(Paths.document, LIBRARY_CACHE_FILE_NAME);
}

/** The saved library as JSON text, or null if there is none or it is unreadable. */
export async function readLibraryCache(): Promise<string | null> {
  try {
    const file = libraryCacheFile();
    return file.exists ? await file.text() : null;
  } catch {
    // An unreadable cache just means scanning again.
    return null;
  }
}

/** Saves JSON text produced by `JSON.stringify` of a `CachedLibrary`. */
export async function writeLibraryCache(text: string): Promise<void> {
  // A half-written file fails to parse on the next launch, which also just
  // means scanning again, so no temp-file swap is needed.
  await libraryCacheFile().write(text);
}

export async function saveLibraryCache(library: CachedLibrary): Promise<void> {
  await writeLibraryCache(JSON.stringify(library));
}

/** Clears library caches from older versions of the app. */
export function removeLegacyLibraryCaches(): void {
  AsyncStorage.multiRemove(LEGACY_LIBRARY_CACHE_KEYS).catch(() => undefined);
  for (const name of LEGACY_LIBRARY_CACHE_FILE_NAMES) {
    try {
      const file = new File(Paths.document, name);
      if (file.exists) {
        file.delete();
      }
    } catch {
      // Nothing to clean up.
    }
  }
}

export function parseCachedLibrary(value: string): CachedLibrary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { folders?: unknown }).folders) ||
    !Array.isArray((parsed as { tracks?: unknown }).tracks)
  ) {
    return null;
  }

  return parsed as CachedLibrary;
}

export function parseFolderRules(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((folderId) => typeof folderId === 'string')
  ) {
    throw new Error('Saved folder choices are invalid. Please choose your folders again.');
  }
  return parsed;
}

/** Saved sort and tab, falling back to defaults for anything unreadable. */
export function parseLibraryView(value: string | null): LibraryView {
  if (!value) {
    return DEFAULT_LIBRARY_VIEW;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return DEFAULT_LIBRARY_VIEW;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return DEFAULT_LIBRARY_VIEW;
  }
  const view = parsed as Record<string, unknown>;
  const sortBy = LIBRARY_SORT_OPTIONS.find((option) => option.id === view.sortBy);
  const tab = TABS.find((item) => item === view.tab);
  return {
    sortBy: sortBy?.id ?? DEFAULT_LIBRARY_VIEW.sortBy,
    sortDirection:
      view.sortDirection === 'descending' ? 'descending' : 'ascending',
    tab: tab ?? DEFAULT_LIBRARY_VIEW.tab,
  };
}

export function countIncludedTracks(
  musicFolders: MusicFolder[],
  blockedIds: string[],
): number {
  return musicFolders.reduce(
    (total, folder) =>
      total + (blockedIds.includes(folder.id) ? 0 : folder.trackCount),
    0,
  );
}
