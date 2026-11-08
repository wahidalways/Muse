import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { createSavedStore } from './savedStore';

/** Star ratings, 1 to 5, by track id. Unrated songs are not stored. */
export type Ratings = Readonly<Record<string, number>>;

const store = createSavedStore<Ratings>(AsyncStorage, '@muse/ratings/v1', {}, (value) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, stars]) => Number.isInteger(stars) && stars >= 1 && stars <= 5,
    ),
  );
});

/** Sets a song's stars. 0 clears the rating. */
export function setRating(trackId: string, stars: number) {
  store.update((ratings) => {
    const next = { ...ratings };
    if (stars >= 1 && stars <= 5) {
      next[trackId] = Math.round(stars);
    } else {
      delete next[trackId];
    }
    return next;
  });
}

export function useRatings(): Ratings {
  return useSyncExternalStore(store.subscribe, store.get);
}
