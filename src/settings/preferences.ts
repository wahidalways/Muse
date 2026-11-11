import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { createSavedStore } from '../library/savedStore';

/** Which tab Muse opens on. 'last' reopens where you left off. */
export type StartTab = 'last' | 'home' | 'library' | 'more';

/** Real covers (Muse art only where a song has none), or Muse art everywhere. */
export type ArtworkStyle = 'covers' | 'generated';
/** Which Muse art design (components/MuseArt.tsx). */
export type ArtSet = 'shapes' | 'bauhaus' | 'stripes' | 'orbit' | 'letter';
const ART_SET_IDS: ArtSet[] = ['shapes', 'bauhaus', 'stripes', 'orbit', 'letter'];
/** How the full player is laid out (Settings › Appearance › Player skin). */
export type PlayerSkin = 'classic' | 'bleed' | 'vinyl' | 'minimal';
const PLAYER_SKIN_IDS: PlayerSkin[] = ['classic', 'bleed', 'vinyl', 'minimal'];
/** Glass bar only: the mini player sits on the tabs as one piece, or floats above them. */
export type MiniDock = 'joined' | 'floating';
/** Previous: restart the song once past 3 seconds (then go back), or always go back. */
export type PreviousButton = 'restart' | 'back';
/** The launcher icon (Settings › Look & feel › App icon). Matches plugins/app-icons.json. */
export type AppIconId = 'muse' | 'light' | 'lime' | 'mono' | 'paper' | 'ocean';
const APP_ICON_IDS: AppIconId[] = ['muse', 'light', 'lime', 'mono', 'paper', 'ocean'];

export type Preferences = {
  startTab: StartTab;
  /** Hide files shorter than shortAudioSeconds (voice notes, ringtones). */
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
  /** Muse art instead of every cover, including photos picked for playlists and mixes. */
  artworkStyle: ArtworkStyle;
  /** When a song file holds several pictures, show the biggest front cover (Muse reads every picture). */
  bestFileCover: boolean;
  artSet: ArtSet;
  playerSkin: PlayerSkin;
  miniDock: MiniDock;
  /** Files shorter than this many seconds are left out when skipShortAudio is on. */
  shortAudioSeconds: number;
  previousButton: PreviousButton;
  /** The sleep timer lowers the volume over its last SLEEP_FADE_SECONDS. */
  sleepFade: boolean;
  /** Play again when headphones come back, if Muse paused because they went away. */
  resumeOnConnect: boolean;
  /** Nothing is added to listening history (stats, play counts, goal, recap, mixes). */
  historyPaused: boolean;
  appIcon: AppIconId;
};

export const SHORT_AUDIO_OPTIONS = [15, 30, 60, 120];
export const CROSSFADE_OPTIONS = [0, 2, 4, 6, 8, 12];
export const SLEEP_FADE_SECONDS = 30;

/** Save battery turns these off (with the solid bar); the Muse look turns them back on. */
export const SAVER_LOOK = { bestFileCover: false, coverBackground: false, dynamicAccent: false } as const;
export const MUSE_LOOK = { bestFileCover: true, coverBackground: true, dynamicAccent: false } as const;

const DEFAULTS: Preferences = {
  startTab: 'last',
  skipShortAudio: false,
  pauseOnDisconnect: true,
  haptics: true,
  showAudioDetails: true,
  showPlayCount: false,
  crossfadeSeconds: 0,
  dynamicAccent: false,
  // Off for new installs: the phone's buttons do the same, and the cover gets the room.
  showVolumeSlider: false,
  coverBackground: true,
  showTimeRemaining: false,
  shrinkArtworkOnPause: false,
  artworkStyle: 'covers',
  bestFileCover: true,
  artSet: 'shapes',
  playerSkin: 'classic',
  // Floating for people who set up Muse before Joined existed; setup saves Joined for new installs.
  miniDock: 'floating',
  shortAudioSeconds: 30,
  previousButton: 'restart',
  sleepFade: true,
  resumeOnConnect: false,
  historyPaused: false,
  appIcon: 'muse',
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
    artworkStyle: saved.artworkStyle === 'generated' ? 'generated' : DEFAULTS.artworkStyle,
    bestFileCover: flag('bestFileCover'),
    artSet: ART_SET_IDS.includes(saved.artSet as ArtSet) ? (saved.artSet as ArtSet) : DEFAULTS.artSet,
    playerSkin: PLAYER_SKIN_IDS.includes(saved.playerSkin as PlayerSkin)
      ? (saved.playerSkin as PlayerSkin)
      : DEFAULTS.playerSkin,
    miniDock: saved.miniDock === 'joined' ? 'joined' : 'floating',
    crossfadeSeconds: CROSSFADE_OPTIONS.includes(saved.crossfadeSeconds as number)
      ? (saved.crossfadeSeconds as number)
      : DEFAULTS.crossfadeSeconds,
    shortAudioSeconds: SHORT_AUDIO_OPTIONS.includes(saved.shortAudioSeconds as number)
      ? (saved.shortAudioSeconds as number)
      : DEFAULTS.shortAudioSeconds,
    previousButton: saved.previousButton === 'back' ? 'back' : 'restart',
    sleepFade: flag('sleepFade'),
    resumeOnConnect: flag('resumeOnConnect'),
    historyPaused: flag('historyPaused'),
    appIcon: APP_ICON_IDS.includes(saved.appIcon as AppIconId) ? (saved.appIcon as AppIconId) : DEFAULTS.appIcon,
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

/** Calls `listener` whenever any preference changes (or the saved copy loads). */
export const subscribePreferences = store.subscribe;

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  store.update((current) => ({ ...current, [key]: value }));
}

/** Several at once, such as the Save battery bundle. */
export function setPreferences(values: Partial<Preferences>) {
  store.update((current) => ({ ...current, ...values }));
}

/** Settings › Reset settings. Pause history is a privacy choice, so a reset leaves it as it is. */
export function resetPreferences() {
  store.update((current) => ({ ...DEFAULTS, historyPaused: current.historyPaused }));
}
