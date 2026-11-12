import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { createSavedStore } from '../library/savedStore';
import { applyAudioEffects, attachAudioEffects } from '../../modules/muse-audio-metadata/effects';
import { isBitPerfectEngaged, subscribeOutput } from '../playback/output';
import { DEFAULT_SOUND, buildEffects, parseSound, type Sound } from './sound';

export type EqualizerState = {
  enabled: boolean;
  sound: Sound;
};

const DEFAULT_STATE: EqualizerState = { enabled: false, sound: DEFAULT_SOUND };

function parseState(value: unknown): EqualizerState | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const saved = value as Record<string, unknown>;
  return {
    enabled: typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULT_STATE.enabled,
    sound: parseSound(saved.sound) ?? DEFAULT_SOUND,
  };
}

const store = createSavedStore<EqualizerState>(AsyncStorage, '@muse/equalizer/v1', DEFAULT_STATE, parseState);

/** A slider being dragged: heard and drawn right away, saved when let go. */
let draft: Sound | null = null;

export type EqualizerSnapshot = {
  enabled: boolean;
  /** The sound in effect, a drag included. */
  sound: Sound;
};

function makeSnapshot(): EqualizerSnapshot {
  const state = store.get();
  return { enabled: state.enabled, sound: draft ?? state.sound };
}

let snapshot = makeSnapshot();
const listeners = new Set<() => void>();

function refresh() {
  snapshot = makeSnapshot();
  listeners.forEach((listener) => listener());
  syncEffects();
}
store.subscribe(refresh);
subscribeOutput(() => syncEffects());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useEqualizer(): EqualizerSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

const label = () => (snapshot.enabled ? (snapshot.sound.presetName ?? 'Custom') : 'Off');

/**
 * "Rock", "Custom" or "Off". A string, so the screens showing it re-render
 * only when it changes, not on every step of a slider drag.
 */
export function useEqualizerLabel(): string {
  return useSyncExternalStore(subscribe, label);
}

// ---------------------------------------------------------------------------
// Native effect

let attached = false;
let applying = false;
let applyAgain = false;

function syncEffects() {
  if (!attached) {
    return;
  }
  // One native call at a time; a drag's many changes collapse into the latest.
  if (applying) {
    applyAgain = true;
    return;
  }
  applying = true;
  // Bit-perfect output: the equalizer steps aside (it would change the bits).
  void applyAudioEffects(buildEffects(snapshot.sound, snapshot.enabled && !isBitPerfectEngaged())).finally(() => {
    applying = false;
    if (applyAgain) {
      applyAgain = false;
      syncEffects();
    }
  });
}

/** Connects the effect to the player. Called once, by the playback controller. */
export function startEqualizer(player: object) {
  void attachAudioEffects(player).then((ok) => {
    if (ok) {
      attached = true;
      void store.ready.then(refresh);
    }
  });
}

// ---------------------------------------------------------------------------
// Changes

/**
 * Changes the sound by hand. Band changes (`custom`, the default) make it
 * "Custom"; the bass boost keeps the preset name. `live` (a drag in progress)
 * is heard and drawn but saved only by the final, non-live call. Editing turns
 * the equalizer on: you want to hear what you change.
 */
export function editSound(
  change: (sound: Sound) => Sound,
  { live = false, custom = true }: { live?: boolean; custom?: boolean } = {},
) {
  const changed = change(snapshot.sound);
  const next = custom ? { ...changed, presetName: null } : changed;
  if (live) {
    draft = next;
    if (!store.get().enabled) {
      store.update((state) => ({ ...state, enabled: true }));
    } else {
      refresh();
    }
    return;
  }
  draft = null;
  store.update(() => ({ enabled: true, sound: next }));
}

/** Puts a whole sound in place, keeping its preset name. */
export function applySound(sound: Sound) {
  draft = null;
  store.update(() => ({ enabled: true, sound }));
}

export function setEqualizerEnabled(enabled: boolean) {
  draft = null;
  store.update((state) => ({ ...state, enabled }));
}
