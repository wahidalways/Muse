import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { createSavedStore } from './savedStore';

/** Speeds a song can play at. Pitch stays natural at all of them. */
export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * Playback speed per song, remembered: set a podcast to 1.5x once and it
 * always plays at 1.5x. Only songs not at 1x are stored.
 */
const store = createSavedStore<Record<string, number>>(
  AsyncStorage,
  '@muse/track-speeds/v1',
  {},
  (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    // Unknown speeds are dropped, so a bad entry can only reset that song.
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        ([, speed]) => typeof speed === 'number' && speed !== 1 && SPEED_OPTIONS.includes(speed),
      ),
    ) as Record<string, number>;
  },
);

export function getTrackSpeed(trackId: string): number {
  return store.get()[trackId] ?? 1;
}

export function useTrackSpeed(trackId: string): number {
  return useSyncExternalStore(store.subscribe, () => getTrackSpeed(trackId));
}

export function setTrackSpeed(trackId: string, speed: number) {
  store.update((current) => {
    const next = { ...current };
    if (speed === 1) {
      delete next[trackId];
    } else {
      next[trackId] = speed;
    }
    return next;
  });
}

/** Calls `listener` whenever any song's speed changes (or the saved copy loads). */
export const subscribeTrackSpeeds = store.subscribe;
