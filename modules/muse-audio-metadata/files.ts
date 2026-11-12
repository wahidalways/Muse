import { requireOptionalNativeModule } from 'expo-modules-core';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** A folder picked in Android's folder picker, for formats the media library cannot list. */
export type MusicFolderPick = { uri: string; name: string };

export type OutputOptions = {
  /** 24-bit and float songs keep full precision (default on). */
  hiRes: boolean;
  /** USB DAC on Android 14+: the song's own samples, untouched. */
  bitPerfect: boolean;
  /** DSD over PCM for DACs that take it (bit-perfect only). */
  dop: boolean;
};

/**
 * What the output does right now. mode: "idle" before anything played,
 * "standard" (16-bit path), "hiRes" (float path), "bitPerfect", or
 * "dopBlocked" (DSD over PCM had no DoP DAC, so silence plays).
 * note: "noDac" (bit-perfect on, no USB DAC) or "dacRate" (the DAC has no
 * bit-perfect mode at this rate).
 */
export type OutputState = {
  mode: 'idle' | 'standard' | 'hiRes' | 'bitPerfect' | 'dopBlocked';
  sampleRate?: number;
  channels?: number;
  outputBits?: number;
  pipelineBits?: number;
  dop?: boolean;
  device?: string | null;
  note?: 'noDac' | 'dacRate';
};

type NativeFiles = {
  hasAllFilesAccess(): boolean;
  openAllFilesAccess(): boolean;
  pickMusicFolder(): Promise<MusicFolderPick | null>;
  getMusicFolders(): MusicFolderPick[];
  removeMusicFolder(uri: string): void;
  trashTracks(ids: string[]): Promise<boolean>;
  getOutputOptions(): OutputOptions & { bitPerfectSupported: boolean };
  setOutputOptions(hiRes: boolean, bitPerfect: boolean, dop: boolean): void;
  getOutputState(): OutputState;
  getUsbDacName(): string | null;
  downloadUpdate(url: string, name: string, sha256: string | null, size: number | null): Promise<string>;
  cancelUpdateDownload(): void;
  installUpdate(path: string): Promise<void>;
  addListener(event: 'onOutputChange', listener: (state: OutputState) => void): { remove(): void };
  addListener(event: 'onUpdateProgress', listener: (progress: UpdateProgress) => void): { remove(): void };
  addListener(event: 'onUpdateStatus', listener: (status: UpdateStatus) => void): { remove(): void };
};

export type UpdateProgress = { received: number; total: number };
/** Android's installer: its prompt is up, Muse was replaced, the person said no, or it failed. */
export type UpdateStatus = { status: 'confirm' | 'installed' | 'cancelled' | 'failed'; message: string | null };

// Missing in Expo Go, which cannot load custom native modules.
const native = requireOptionalNativeModule<NativeFiles>('MuseFiles');

export const filesSupported = native !== null;

/** Android's All files access: Muse then finds APE, WavPack and DSD anywhere on its own. */
export function hasAllFilesAccess(): boolean {
  try {
    return native?.hasAllFilesAccess() ?? false;
  } catch {
    return false;
  }
}

/** Opens Android's switch for it (Android 11+). False when there is none to open. */
export function openAllFilesAccess(): boolean {
  try {
    return native?.openAllFilesAccess() ?? false;
  } catch {
    return false;
  }
}

/** Whether All files access is on, checked again each time Muse comes back to the screen. */
export function useAllFilesAccess(): boolean {
  const [granted, setGranted] = useState(hasAllFilesAccess);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setGranted(hasAllFilesAccess());
      }
    });
    return () => subscription.remove();
  }, []);
  return granted;
}

export function pickMusicFolder(): Promise<MusicFolderPick | null> {
  return native?.pickMusicFolder() ?? Promise.resolve(null);
}

export function getMusicFolders(): MusicFolderPick[] {
  try {
    return native?.getMusicFolders() ?? [];
  } catch {
    return [];
  }
}

export function removeMusicFolder(uri: string): void {
  native?.removeMusicFolder(uri);
}

/** Media-library songs go to Android's trash (one Android prompt); picked-folder files are deleted. False when declined. */
export function trashTracks(ids: string[]): Promise<boolean> {
  return native?.trashTracks(ids) ?? Promise.resolve(false);
}

export function getOutputOptions(): (OutputOptions & { bitPerfectSupported: boolean }) | null {
  try {
    return native?.getOutputOptions() ?? null;
  } catch {
    return null;
  }
}

export function setOutputOptions(options: OutputOptions): void {
  native?.setOutputOptions(options.hiRes, options.bitPerfect, options.dop);
}

export function getOutputState(): OutputState {
  try {
    return native?.getOutputState() ?? { mode: 'idle' };
  } catch {
    return { mode: 'idle' };
  }
}

export function getUsbDacName(): string | null {
  try {
    return native?.getUsbDacName() ?? null;
  } catch {
    return null;
  }
}

export function addOutputListener(listener: (state: OutputState) => void): { remove(): void } {
  return native?.addListener('onOutputChange', listener) ?? { remove: () => undefined };
}

/** In-app updates need Muse's native code (not in Expo Go). */
export const canInstallUpdates = native !== null;

/** Downloads a release APK into Muse's cache and checks it; resolves the file's path. Rejects with code ERR_CANCELLED when cancelled. */
export function downloadUpdate(url: string, name: string, sha256: string | null, size: number | null): Promise<string> {
  if (!native) {
    return Promise.reject(new Error('Needs the Muse app'));
  }
  return native.downloadUpdate(url, name, sha256, size);
}

export function cancelUpdateDownload(): void {
  native?.cancelUpdateDownload();
}

/** Opens Android's install prompt; the outcome arrives through addUpdateStatusListener. */
export function installUpdate(path: string): Promise<void> {
  return native?.installUpdate(path) ?? Promise.reject(new Error('Needs the Muse app'));
}

export function addUpdateProgressListener(listener: (progress: UpdateProgress) => void): { remove(): void } {
  return native?.addListener('onUpdateProgress', listener) ?? { remove: () => undefined };
}

export function addUpdateStatusListener(listener: (status: UpdateStatus) => void): { remove(): void } {
  return native?.addListener('onUpdateStatus', listener) ?? { remove: () => undefined };
}
