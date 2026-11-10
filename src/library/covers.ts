import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import { getArtworkColor, getCoverThumb, getImageColor, type CoverColor } from '../../modules/muse-audio-metadata';
import { getPreferences } from '../settings/preferences';
import { removeCoverFile, saveCoverPhoto } from './playlists';
import { createSavedStore } from './savedStore';

/**
 * A song's own cover, chosen in Change cover, for that song only. `image` is
 * a picture saved inside Muse (from the song's file, online or a photo), and
 * `ref` says which one, so Change cover can mark it. The music file itself is
 * never changed: removing the choice brings the original back.
 */
export type SongCover = { kind: 'image'; uri: string; ref: string } | { kind: 'muse' };

const FOLDER = 'song-covers';

function parseCovers(value: unknown): Record<string, SongCover> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const covers: Record<string, SongCover> = {};
  for (const [trackId, saved] of Object.entries(value as Record<string, unknown>)) {
    const cover = saved as { kind?: unknown; uri?: unknown; ref?: unknown } | null;
    if (cover?.kind === 'muse') {
      covers[trackId] = { kind: 'muse' };
    } else if (cover?.kind === 'image' && typeof cover.uri === 'string' && typeof cover.ref === 'string') {
      covers[trackId] = { kind: 'image', uri: cover.uri, ref: cover.ref };
    }
  }
  return covers;
}

const store = createSavedStore<Record<string, SongCover>>(AsyncStorage, '@muse/song-covers/v1', {}, parseCovers);

export function getSongCover(trackId: string): SongCover | undefined {
  return store.get()[trackId];
}

/** Calls `listener` whenever any song's cover is set or reset. */
export const subscribeSongCovers = store.subscribe;

export function useSongCover(trackId: string): SongCover | undefined {
  return useSyncExternalStore(store.subscribe, () => store.get()[trackId]);
}

/** Sets a song's own cover, or with null goes back to the original. A replaced picture's file is deleted. */
export function setSongCover(trackId: string, cover: SongCover | null) {
  const old = store.get()[trackId];
  store.update((current) => {
    const next = { ...current };
    if (cover) {
      next[trackId] = cover;
    } else {
      delete next[trackId];
    }
    return next;
  });
  if (old?.kind === 'image' && !(cover?.kind === 'image' && cover.uri === old.uri)) {
    removeCoverFile(old.uri);
  }
}

/** Copies a picture on the phone (one from the song's file, or a photo) into Muse and uses it. */
export async function saveImageCover(trackId: string, sourceUri: string, ref: string) {
  const uri = await saveCoverPhoto(FOLDER, trackId, sourceUri);
  setSongCover(trackId, { kind: 'image', uri, ref });
}

/** Downloads a cover found online into Muse and uses it. Throws when the download fails. */
export async function saveOnlineCover(trackId: string, url: string, ref: string) {
  const folder = new Directory(Paths.document, FOLDER);
  folder.create({ idempotent: true, intermediates: true });
  // A new name each time, so images never show an old cached copy.
  const file = new File(folder, `${trackId}-${Date.now().toString(36)}.jpg`);
  const saved = await File.downloadFileAsync(url, file);
  setSongCover(trackId, { kind: 'image', uri: saved.uri, ref });
}

/**
 * The main hue of the cover the song shows: its own picture, the best one in
 * its file, or Android's. Muse art's hue comes from generatedArtHue instead.
 */
export async function coverColor(trackId: string): Promise<CoverColor | null> {
  const cover = getSongCover(trackId);
  if (cover?.kind === 'image') {
    return getImageColor(cover.uri);
  }
  if (getPreferences().bestFileCover) {
    const thumb = await getCoverThumb(trackId);
    const color = thumb ? await getImageColor(thumb) : null;
    if (color) {
      return color;
    }
  }
  return getArtworkColor(trackId);
}
