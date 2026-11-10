import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { createSavedStore } from './savedStore';

/**
 * Favorite songs, by track id, saved on the phone. Kept outside React so a
 * heart re-renders only itself when it changes. The saved store replays a
 * heart tapped while the saved list is still loading on top of that list,
 * so an early tap never overwrites the others.
 */
const store = createSavedStore<readonly string[]>(AsyncStorage, '@muse/favorites/v1', [], (value) =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : null,
);

let lastIds = store.get();
let lastSet: ReadonlySet<string> = new Set(lastIds);
/** The same Set until the list changes, as useSyncExternalStore needs. */
function favoriteSet(): ReadonlySet<string> {
  const ids = store.get();
  if (ids !== lastIds) {
    lastIds = ids;
    lastSet = new Set(ids);
  }
  return lastSet;
}

export function toggleFavorite(trackId: string) {
  store.update((ids) => (ids.includes(trackId) ? ids.filter((id) => id !== trackId) : [...ids, trackId]));
}

export function useIsFavorite(trackId: string): boolean {
  return useSyncExternalStore(store.subscribe, () => favoriteSet().has(trackId));
}

/** Every favorite track id. Re-renders when any heart changes. */
export function useFavoriteIds(): ReadonlySet<string> {
  return useSyncExternalStore(store.subscribe, favoriteSet);
}
