import { requireOptionalNativeModule } from 'expo-modules-core';

/** The values the native equalizer takes. Built by src/equalizer/sound.ts. */
export type EffectsConfig = {
  enabled: boolean;
  /** Upper edge of each band, in Hz, rising. */
  cutoffs: number[];
  /** Gain of each band in dB, headroom included. */
  gains: number[];
};

type NativeEffects = {
  attach(player: object): Promise<boolean>;
  apply(config: EffectsConfig): Promise<boolean>;
  openPhoneEqualizer(): boolean;
};

// Missing in Expo Go, which cannot load custom native modules.
const native = requireOptionalNativeModule<NativeEffects>('MuseAudioEffects');

/** Whether this build can change the sound at all (false in Expo Go). */
export const effectsSupported = native !== null;

/** Hands the expo-audio player to the equalizer, so it follows its audio session. */
export function attachAudioEffects(player: object): Promise<boolean> {
  return native?.attach(player).catch(() => false) ?? Promise.resolve(false);
}

export function applyAudioEffects(config: EffectsConfig): Promise<boolean> {
  return native?.apply(config).catch(() => false) ?? Promise.resolve(false);
}

/** Opens the phone's own equalizer (or Dolby app, or sound settings). False when none opens. */
export function openPhoneEqualizer(): boolean {
  try {
    return native?.openPhoneEqualizer() ?? false;
  } catch {
    return false;
  }
}
