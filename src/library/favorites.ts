import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const FAVORITES_KEY = '@muse/favorites/v1';

type Listener = () => void;

/**
 * Favorite songs, by track id, saved on the phone. Kept outside React so a
 * heart re-renders only itself when it changes.
 */
let favorites: ReadonlySet<string> = new Set();
let loadStarted = false;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

function ensureLoaded() {
  if (loadStarted) {
    return;
  }
  loadStarted = true;
  AsyncStorage.getItem(FAVORITES_KEY)
    .then((value) => {
      if (!value) {
        return;
      }
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        // Keep anything toggled while loading.
        favorites = new Set([
          ...parsed.filter((id): id is string => typeof id === 'string'),
          ...favorites,
        ]);
        notify();
      }
    })
    .catch(() => undefined);
}

function subscribe(listener: Listener) {
  ensureLoaded();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function toggleFavorite(trackId: string) {
  const next = new Set(favorites);
  if (next.has(trackId)) {
    next.delete(trackId);
  } else {
    next.add(trackId);
  }
  favorites = next;
  notify();
  // A failed save only means the change is lost on the next launch.
  AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([...next])).catch(
    () => undefined,
  );
}

export function useIsFavorite(trackId: string): boolean {
  return useSyncExternalStore(subscribe, () => favorites.has(trackId));
}

/** Every favorite track id. Re-renders when any heart changes. */
export function useFavoriteIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => favorites);
}
