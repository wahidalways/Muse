import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import { createSavedStore } from '../library/savedStore';

/** Optional, kept on this phone only: a name and a photo or preset avatar. */
export type Profile = {
  name: string;
  /** One of the preset avatars, or -1 for none. */
  preset: number;
  /** A picked photo, copied into the app's own folder. Wins over the preset. */
  photoUri: string | null;
};

export const NAME_LIMIT = 24;
export const PRESET_COUNT = 12;
const EMPTY: Profile = { name: '', preset: -1, photoUri: null };

function parseProfile(value: unknown): Profile | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const saved = value as Record<string, unknown>;
  return {
    name: typeof saved.name === 'string' ? saved.name.slice(0, NAME_LIMIT) : '',
    preset: Number.isInteger(saved.preset) && (saved.preset as number) >= 0 && (saved.preset as number) < PRESET_COUNT ? (saved.preset as number) : -1,
    photoUri: typeof saved.photoUri === 'string' ? saved.photoUri : null,
  };
}

const store = createSavedStore<Profile>(AsyncStorage, '@muse/profile/v1', EMPTY, parseProfile);

export function useProfile(): Profile {
  return useSyncExternalStore(store.subscribe, store.get);
}

export const hasProfile = (profile: Profile) => Boolean(profile.name.trim() || profile.photoUri || profile.preset >= 0);

export function setProfileName(name: string) {
  store.update((current) => ({ ...current, name: name.slice(0, NAME_LIMIT) }));
}

export function setProfilePreset(preset: number) {
  removePhoto(store.get().photoUri);
  store.update((current) => ({ ...current, preset, photoUri: null }));
}

/** Copies the picked photo in; the picker's copy lives in a cache Android may clear. */
export async function setProfilePhoto(pickedUri: string) {
  const folder = new Directory(Paths.document, 'profile');
  folder.create({ idempotent: true, intermediates: true });
  const extension = pickedUri.match(/\.(\w+)$/)?.[1] ?? 'jpg';
  // A new name each time, so the image never shows an old cached copy.
  const saved = new File(folder, `photo-${Date.now().toString(36)}.${extension}`);
  await new File(pickedUri).copy(saved);
  removePhoto(store.get().photoUri);
  store.update((current) => ({ ...current, photoUri: saved.uri }));
}

export function clearProfileImage() {
  removePhoto(store.get().photoUri);
  store.update((current) => ({ ...current, preset: -1, photoUri: null }));
}

function removePhoto(uri: string | null) {
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
