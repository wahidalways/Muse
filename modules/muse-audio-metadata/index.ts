import { requireOptionalNativeModule } from 'expo-modules-core';

/** One audio file from Android's media library, with its folder and tags. */
export type NativeAudioTrack = {
  id: string;
  uri: string;
  filename: string;
  folderId: string;
  folderTitle: string;
  /** Folder path relative to storage, ending in "/", when Android reports it. */
  directory: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  year: number | null;
  trackNumber: number | null;
  /** The genre tag, as Android reports it. May hold several, split by ";". */
  genre: string | null;
  /** Seconds. */
  duration: number | null;
  /** When the file arrived in the media library, in seconds since the epoch. */
  dateAdded: number | null;
  /** The file's filesystem last-modified time, in seconds since the epoch. */
  dateModified: number | null;
  /** A content:// uri for list artwork. May point at an album with no art. */
  albumArtUri: string | null;
};

/** What the player can say about a file's audio. Any field may be unknown. */
export type AudioDetails = {
  /** The container, such as audio/mpeg or audio/flac. */
  mimeType: string | null;
  /** The audio codec, such as audio/mp4a-latm (AAC) or audio/flac. */
  codec: string | null;
  /** Bits per second; the file's average when the file records none. */
  bitrate: number | null;
  sampleRate: number | null;
  channels: number | null;
  /** File size in bytes. Missing from builds made before it was added. */
  size?: number | null;
};

/** A cover's main hue (0-360) and how colorful it is (0 grey to 1 vivid). */
export type CoverColor = { hue: number; colorfulness: number };

type MuseAudioMetadataModule = {
  getAudioLibrary(): Promise<NativeAudioTrack[]>;
  getLibraryVersion(): Promise<string | null>;
  getArtworkFile(trackId: string): Promise<string | null>;
  getAudioDetails(trackId: string): Promise<AudioDetails | null>;
  getArtworkColor(trackId: string): Promise<CoverColor | null>;
  addListener(event: 'onAudioBecomingNoisy', listener: () => void): { remove(): void };
  addListener(
    event: 'onVolumeChange',
    listener: (event: { volume: number }) => void,
  ): { remove(): void };
  getVolume(): number | null;
  setVolume(volume: number): void;
  getLyrics(trackId: string): Promise<string | null>;
};

// Missing in Expo Go, which cannot load custom native modules.
const nativeModule =
  requireOptionalNativeModule<MuseAudioMetadataModule>('MuseAudioMetadata');

/** Scans every audio file on the device in one native call. */
export function getAudioLibrary(): Promise<NativeAudioTrack[]> {
  if (!nativeModule) {
    return Promise.reject(
      new Error('Install the Muse app to read the music on this phone.'),
    );
  }
  return nativeModule.getAudioLibrary();
}

/**
 * Changes whenever any media file on the phone is added, changed or removed.
 * Null when unknown (Android 10 and older, or no native module), meaning a
 * full scan is the only way to tell.
 */
export async function getLibraryVersion(): Promise<string | null> {
  try {
    return (await nativeModule?.getLibraryVersion()) ?? null;
  } catch {
    return null;
  }
}

/**
 * A cached file:// copy of the song's album art for the lock screen, or null
 * when there is none or it cannot be read.
 */
export async function getArtworkFile(trackId: string): Promise<string | null> {
  if (!nativeModule) {
    return null;
  }
  try {
    return await nativeModule.getArtworkFile(trackId);
  } catch {
    return null;
  }
}

/** Format, bitrate, sample rate and channels of a song, or null when unknown. */
export async function getAudioDetails(trackId: string): Promise<AudioDetails | null> {
  try {
    return (await nativeModule?.getAudioDetails(trackId)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Calls `listener` when headphones or Bluetooth audio disconnect (Android's
 * "audio becoming noisy"). Does nothing without the native module.
 */
export function addAudioBecomingNoisyListener(listener: () => void): { remove(): void } {
  return nativeModule?.addListener('onAudioBecomingNoisy', listener) ?? { remove: () => undefined };
}

/** The main hue of a song's cover, or null without a cover (or native module). */
export async function getArtworkColor(trackId: string): Promise<CoverColor | null> {
  try {
    return (await nativeModule?.getArtworkColor(trackId)) ?? null;
  } catch {
    return null;
  }
}

/** The phone's media volume, 0 to 1, or null without the native module. */
export function getMediaVolume(): number | null {
  try {
    return nativeModule?.getVolume() ?? null;
  } catch {
    return null;
  }
}

/** Sets the phone's media volume (0 to 1), as the volume buttons do. */
export function setMediaVolume(volume: number): void {
  try {
    nativeModule?.setVolume(volume);
  } catch {
    // Some phones lock volume (fixed-volume devices); the slider just stays.
  }
}

/** Calls `listener` with the new media volume whenever it changes, from anywhere. */
export function addMediaVolumeListener(listener: (volume: number) => void): { remove(): void } {
  return (
    nativeModule?.addListener('onVolumeChange', (event) => listener(event.volume)) ?? {
      remove: () => undefined,
    }
  );
}

/** Lyrics saved inside the song file, or null when there are none. */
export async function getLyrics(trackId: string): Promise<string | null> {
  try {
    return (await nativeModule?.getLyrics(trackId)) ?? null;
  } catch {
    return null;
  }
}
