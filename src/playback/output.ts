import { useSyncExternalStore } from 'react';
import {
  addOutputListener,
  getOutputOptions,
  getOutputState,
  setOutputOptions,
  type OutputOptions,
  type OutputState,
} from '../../modules/muse-audio-metadata/files';

/**
 * Settings › Audio output, and what the output does right now. The choices
 * are saved natively (the player is built before JS runs); this keeps a copy
 * for the UI and for the parts of Muse that must step aside in bit-perfect
 * mode: the equalizer, crossfade, sleep fade and speed would change the bits.
 */

const saved = getOutputOptions();
let options: OutputOptions = saved ?? { hiRes: true, bitPerfect: false, dop: false };
/** Android 14+ only; false in Expo Go and on older phones. */
export const bitPerfectSupported = saved?.bitPerfectSupported ?? false;
let state: OutputState = getOutputState();
let snapshot = { options, state };
const listeners = new Set<() => void>();

function emit() {
  snapshot = { options, state };
  listeners.forEach((listener) => listener());
}

addOutputListener((next) => {
  state = next;
  emit();
});

export function subscribeOutput(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOutput(): { options: OutputOptions; state: OutputState } {
  return useSyncExternalStore(subscribeOutput, () => snapshot);
}

export function setOutput(change: Partial<OutputOptions>) {
  options = { ...options, ...change };
  // DoP only exists inside bit-perfect.
  if (!options.bitPerfect) {
    options = { ...options, dop: false };
  }
  setOutputOptions(options);
  emit();
}

/** The song is going to a USB DAC bit-perfect: nothing in Muse may change its samples. */
export function isBitPerfectEngaged(): boolean {
  return options.bitPerfect && state.mode === 'bitPerfect';
}

/** One line about where the sound goes right now. */
export function describeOutput(state: OutputState): string {
  const rate = state.sampleRate ? `${Number((state.sampleRate / 1000).toFixed(1))} kHz` : '';
  switch (state.mode) {
    case 'bitPerfect':
      return [state.dop ? 'DSD as is (DoP)' : 'Bit-perfect', rate, state.outputBits ? `${state.outputBits}-bit` : '', state.device ?? 'USB DAC']
        .filter(Boolean)
        .join(' · ');
    case 'hiRes':
      return state.note === 'dacRate'
        ? `Hi-Res · ${rate}. This DAC has no bit-perfect mode at ${rate}`
        : ['Hi-Res', rate, 'through Android'].filter(Boolean).join(' · ');
    case 'standard':
      return ['16-bit', rate, 'through Android'].filter(Boolean).join(' · ');
    case 'dopBlocked':
      return 'This DSD needs a DoP DAC, so Muse plays it silent. Turn DoP off to hear it';
    default:
      return 'Play a song to see';
  }
}
