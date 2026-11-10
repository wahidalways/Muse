import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { createSavedStore } from './savedStore';

export type Playlist = {
  id: string;
  name: string;
  /** In play order. A song appears once. */
  trackIds: string[];
  /** A photo chosen from the phone, copied into the app's own folder. */
  coverUri: string | null;
  /** Or a song in the playlist whose album art is the cover. */
  coverTrackId: string | null;
  createdAt: number;
};

const store = createSavedStore<Playlist[]>(AsyncStorage, '@muse/playlists/v1', [], (value) =>
  Array.isArray(value) ? value.filter(isPlaylist) : null,
);

function isPlaylist(value: unknown): value is Playlist {
  const item = value as Partial<Playlist> | null;
  return (
    typeof item?.id === 'string' &&
    typeof item.name === 'string' &&
    Array.isArray(item.trackIds) &&
    item.trackIds.every((id) => typeof id === 'string') &&
    (item.coverUri === null || typeof item.coverUri === 'string') &&
    (item.coverTrackId === null || typeof item.coverTrackId === 'string') &&
    typeof item.createdAt === 'number'
  );
}

export function usePlaylists(): Playlist[] {
  return useSyncExternalStore(store.subscribe, store.get);
}

function change(playlistId: string, edit: (playlist: Playlist) => Playlist) {
  store.update((playlists) =>
    playlists.map((playlist) => (playlist.id === playlistId ? edit(playlist) : playlist)),
  );
}

/** Creates an empty playlist and returns its id. */
export function createPlaylist(name: string): string {
  const id = `playlist-${Date.now().toString(36)}`;
  store.update((playlists) => [
    { id, name: name.trim(), trackIds: [], coverUri: null, coverTrackId: null, createdAt: Date.now() },
    ...playlists,
  ]);
  return id;
}

export function renamePlaylist(playlistId: string, name: string) {
  change(playlistId, (playlist) => ({ ...playlist, name: name.trim() }));
}

export function deletePlaylist(playlistId: string) {
  const playlist = store.get().find((item) => item.id === playlistId);
  removeCoverFile(playlist?.coverUri ?? null);
  store.update((playlists) => playlists.filter((item) => item.id !== playlistId));
}

/** Adds songs to the end, skipping ones already in the playlist. */
export function addToPlaylist(playlistId: string, trackIds: string[]) {
  change(playlistId, (playlist) => {
    const present = new Set(playlist.trackIds);
    const added = trackIds.filter((id) => !present.has(id) && present.add(id));
    return { ...playlist, trackIds: [...playlist.trackIds, ...added] };
  });
}

/**
 * Moves a song to where `toTrackId` sits. By id, not index, because the page
 * leaves out songs whose files are gone, so its positions can differ.
 */
export function movePlaylistTrack(playlistId: string, trackId: string, toTrackId: string) {
  change(playlistId, (playlist) => {
    const from = playlist.trackIds.indexOf(trackId);
    const to = playlist.trackIds.indexOf(toTrackId);
    if (from < 0 || to < 0 || from === to) {
      return playlist;
    }
    const trackIds = playlist.trackIds.filter((id) => id !== trackId);
    trackIds.splice(to, 0, trackId);
    return { ...playlist, trackIds };
  });
}

export function removeFromPlaylist(playlistId: string, trackId: string) {
  change(playlistId, (playlist) => ({
    ...playlist,
    trackIds: playlist.trackIds.filter((id) => id !== trackId),
    coverTrackId: playlist.coverTrackId === trackId ? null : playlist.coverTrackId,
  }));
}

/** Takes a song deleted from the phone out of every playlist. */
export function removeFromAllPlaylists(trackId: string) {
  store.update((playlists) =>
    playlists.map((playlist) =>
      playlist.trackIds.includes(trackId)
        ? {
            ...playlist,
            trackIds: playlist.trackIds.filter((id) => id !== trackId),
            coverTrackId: playlist.coverTrackId === trackId ? null : playlist.coverTrackId,
          }
        : playlist,
    ),
  );
}

/** Uses a song's album art as the cover, or the automatic cover with null. */
export function setPlaylistCoverTrack(playlistId: string, trackId: string | null) {
  const playlist = store.get().find((item) => item.id === playlistId);
  removeCoverFile(playlist?.coverUri ?? null);
  change(playlistId, (item) => ({ ...item, coverUri: null, coverTrackId: trackId }));
}

/**
 * Copies a picked photo into the app's own folder and uses it as the cover.
 * The picker's copy lives in a cache Android may clear at any time.
 */
export async function setPlaylistCoverPhoto(playlistId: string, pickedUri: string) {
  const savedUri = await saveCoverPhoto('playlist-covers', playlistId, pickedUri);
  const playlist = store.get().find((item) => item.id === playlistId);
  removeCoverFile(playlist?.coverUri ?? null);
  change(playlistId, (item) => ({ ...item, coverUri: savedUri, coverTrackId: null }));
}

/** Copies a picked photo into `folderName` in the app's own folder; returns the copy's uri. */
export async function saveCoverPhoto(folderName: string, name: string, pickedUri: string): Promise<string> {
  const folder = new Directory(Paths.document, folderName);
  folder.create({ idempotent: true, intermediates: true });
  const extension = pickedUri.match(/\.(\w+)$/)?.[1] ?? 'jpg';
  // A new name each time, so images never show an old cached copy.
  const saved = new File(folder, `${name}-${Date.now().toString(36)}.${extension}`);
  await new File(pickedUri).copy(saved);
  return saved.uri;
}

export function removeCoverFile(uri: string | null) {
  if (!uri) {
    return;
  }
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Already gone. Nothing else depends on it.
  }
}
