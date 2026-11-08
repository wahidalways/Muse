import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { createSavedStore } from '../library/savedStore';

/** Which tab Muse opens on. 'last' reopens where you left off. */
export type StartTab = 'last' | 'home' | 'library' | 'more';

export type Preferences = {
  startTab: StartTab;
  /** Hide files under SHORT_AUDIO_SECONDS (voice notes, ringtones). */
  skipShortAudio: boolean;
  /** Pause when headphones or Bluetooth audio disconnect. */
  pauseOnDisconnect: boolean;
  haptics: boolean;
  /** Format, bitrate and sample rate under the song in the full player. */
  showAudioDetails: boolean;
  showPlayCount: boolean;
  /** Seconds a song fades out over at its end (and the next fades in); 0 is off. */
  crossfadeSeconds: number;
  /** The accent follows the playing song's cover (Appearance › Dynamic). */
  dynamicAccent: boolean;
  /** A phone-volume slider in the full player. */
  showVolumeSlider: boolean;
  /** A soft gradient from the cover's color behind the full player. */
  coverBackground: boolean;
  /** The full player's end time shows time left instead of length (tap it). */
  showTimeRemaining: boolean;
  /** The full player's cover shrinks a little while paused, as in Apple Music. */
  shrinkArtworkOnPause: boolean;
};

export const SHORT_AUDIO_SECONDS = 30;
export const CROSSFADE_OPTIONS = [0, 2, 4, 6, 8, 12];

const DEFAULTS: Preferences = {
  startTab: 'last',
  skipShortAudio: false,
  pauseOnDisconnect: true,
  haptics: true,
  showAudioDetails: false,
  showPlayCount: false,
  crossfadeSeconds: 0,
  dynamicAccent: false,
  showVolumeSlider: true,
  coverBackground: true,
  showTimeRemaining: false,
  shrinkArtworkOnPause: false,
};

const START_TABS: StartTab[] = ['last', 'home', 'library', 'more'];

/** Keeps every known field that has the right type; the rest fall back to defaults. */
function parsePreferences(value: unknown): Preferences | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const saved = value as Record<string, unknown>;
  const flag = (key: keyof Preferences) =>
    typeof saved[key] === 'boolean' ? (saved[key] as boolean) : (DEFAULTS[key] as boolean);
  return {
    startTab: START_TABS.includes(saved.startTab as StartTab)
      ? (saved.startTab as StartTab)
      : DEFAULTS.startTab,
    skipShortAudio: flag('skipShortAudio'),
    pauseOnDisconnect: flag('pauseOnDisconnect'),
    haptics: flag('haptics'),
    showAudioDetails: flag('showAudioDetails'),
    showPlayCount: flag('showPlayCount'),
    dynamicAccent: flag('dynamicAccent'),
    showVolumeSlider: flag('showVolumeSlider'),
    coverBackground: flag('coverBackground'),
    showTimeRemaining: flag('showTimeRemaining'),
    shrinkArtworkOnPause: flag('shrinkArtworkOnPause'),
    crossfadeSeconds: CROSSFADE_OPTIONS.includes(saved.crossfadeSeconds as number)
      ? (saved.crossfadeSeconds as number)
      : DEFAULTS.crossfadeSeconds,
  };
}

const store = createSavedStore<Preferences>(
  AsyncStorage,
  '@muse/preferences/v1',
  DEFAULTS,
  parsePreferences,
);

export function usePreferences(): Preferences {
  return useSyncExternalStore(store.subscribe, store.get);
}

/** The current value outside React, such as in the playback or haptics code. */
export function getPreferences(): Preferences {
  return store.get();
}

/** Settles once the saved copy has loaded, for decisions made at launch. */
export const preferencesReady = store.ready;

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  store.update((current) => ({ ...current, [key]: value }));
}
