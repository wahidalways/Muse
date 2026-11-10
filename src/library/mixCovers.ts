import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import type { MixId } from '../history/mixes';
import { createSavedStore } from './savedStore';
import { removeCoverFile, saveCoverPhoto } from './playlists';

/** A photo the person picked for a Home mix, by mix id. Mixes without one use song covers. */
type MixCovers = Partial<Record<MixId, string>>;

const store = createSavedStore<MixCovers>(AsyncStorage, '@muse/mix-covers/v1', {}, (value) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([, uri]) => typeof uri === 'string'))
    : null,
);

export function useMixCover(mixId: MixId): string | null {
  return useSyncExternalStore(store.subscribe, () => store.get()[mixId] ?? null);
}

export async function setMixCoverPhoto(mixId: MixId, pickedUri: string) {
  const savedUri = await saveCoverPhoto('mix-covers', mixId, pickedUri);
  removeCoverFile(store.get()[mixId] ?? null);
  store.update((covers) => ({ ...covers, [mixId]: savedUri }));
}

/** Back to the automatic song covers. */
export function clearMixCover(mixId: MixId) {
  removeCoverFile(store.get()[mixId] ?? null);
  store.update((covers) => {
    const { [mixId]: _removed, ...rest } = covers;
    return rest;
  });
}
