

/** "4:05", or "1:02:05" from an hour up. */
export function formatTrackDuration(durationInSeconds: number): string {
  const totalSeconds = Math.floor(durationInSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

/** Always mm:ss ("60:00", "09:59"; timers run up to an hour), so the countdown keeps one width and the buttons beside it never shift. */
export function formatSleepTimer(secondsLeft: number): string {
  const total = Math.max(0, Math.floor(secondsLeft));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function formatTimeAgo(timestamp: number): string {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) {
    return 'Now';
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h`;
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    return `${elapsedDays}d`;
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** Listening time as "2h 14m", "45m" or "Under 1m". */
export function formatListeningTime(totalSeconds: number): string {
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 1) {
    return totalSeconds > 0 ? 'Under 1m' : '0m';
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** An hour of the day, 0 to 23, as "9 PM". */
export function formatHour(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  return `${hour % 12 === 0 ? 12 : hour % 12} ${suffix}`;
}

/** Change from `previous` to `current` as a whole percent, or null with no baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

/** A file size as "840 KB" or "12.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  }
  const megabytes = bytes / (1024 * 1024);
  return megabytes < 1024
    ? `${megabytes.toFixed(megabytes < 10 ? 1 : 0)} MB`
    : `${(megabytes / 1024).toFixed(1)} GB`;
}

/** How many times a song was played, as "1 play" or "12 plays". */
export function formatPlayCount(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'play' : 'plays'}`;
}

const FORMAT_NAMES: Record<string, string> = {
  'audio/mpeg': 'MP3',
  'audio/mp3': 'MP3',
  'audio/flac': 'FLAC',
  'audio/x-flac': 'FLAC',
  'audio/mp4a-latm': 'AAC',
  'audio/aac': 'AAC',
  'audio/mp4': 'M4A',
  'audio/x-m4a': 'M4A',
  'audio/alac': 'ALAC',
  'audio/opus': 'Opus',
  'audio/vorbis': 'Vorbis',
  'audio/ogg': 'OGG',
  'audio/wav': 'WAV',
  'audio/x-wav': 'WAV',
  'audio/raw': 'WAV',
  'audio/amr-wb': 'AMR',
  'audio/3gpp': 'AMR',
  'audio/x-aiff': 'AIFF',
  'audio/aiff': 'AIFF',
  // Muse's own readers name these directly.
  aiff: 'AIFF',
  ape: 'APE',
  wavpack: 'WavPack',
  dsd: 'DSD',
};

type FileAudio = {
  mimeType: string | null;
  codec: string | null;
  bitrate: number | null;
  sampleRate: number | null;
  channels: number | null;
  bitDepth?: number | null;
} | null;

/** Formats that keep every bit of the recording. */
const LOSSLESS = new Set(['FLAC', 'ALAC', 'WAV', 'AIFF', 'APE', 'WavPack', 'DSD']);

/**
 * A file's audio in parts, for the player's badge row. `quality` is a plain
 * fact of the file: Lossless for a lossless format, Hi-Res when that lossless
 * audio is beyond CD (more than 16-bit or more than 48 kHz). `specs` are
 * bit depth (lossless only), sample rate, bitrate, and Mono or "6 ch" only
 * when not stereo. Unknown parts are left out; the format falls back to the
 * file extension.
 */
export function summarizeAudio(details: FileAudio, filename: string) {
  const extension = filename.includes('.') ? filename.split('.').pop()!.toUpperCase() : '';
  const format =
    (details?.codec && FORMAT_NAMES[details.codec.toLowerCase()]) ||
    (details?.mimeType && FORMAT_NAMES[details.mimeType.toLowerCase()]) ||
    extension;
  const lossless = LOSSLESS.has(format);
  const bitDepth = lossless && details?.bitDepth && details.bitDepth > 0 ? details.bitDepth : null;
  const sampleRate = details?.sampleRate && details.sampleRate > 0 ? details.sampleRate : null;
  const quality = !lossless
    ? null
    : (bitDepth ?? 0) > 16 || (sampleRate ?? 0) > 48000
      ? ('Hi-Res' as const)
      : ('Lossless' as const);
  const specs: string[] = [];
  // DSD is named by its rate as a multiple of 44.1 kHz: DSD64, DSD128...
  if (format === 'DSD' && sampleRate) {
    specs.push(`DSD${Math.round(sampleRate / 44100)}`);
    if (details?.channels && details.channels !== 2) {
      specs.push(details.channels === 1 ? 'Mono' : `${details.channels} ch`);
    }
    return { format, quality: 'Hi-Res' as const, specs };
  }
  if (bitDepth) {
    specs.push(`${bitDepth}-bit`);
  }
  if (sampleRate) {
    specs.push(`${Number((sampleRate / 1000).toFixed(1))} kHz`);
  }
  if (details?.bitrate && details.bitrate > 0) {
    specs.push(`${Math.round(details.bitrate / 1000).toLocaleString('en-US')} kbps`);
  }
  if (details?.channels && details.channels !== 2) {
    specs.push(details.channels === 1 ? 'Mono' : `${details.channels} ch`);
  }
  return { format, quality, specs };
}

/**
 * One full line about a file's audio, for Song info, as
 * "FLAC · Hi-Res · 24-bit · 96 kHz · 4,608 kbps · Stereo".
 */
export function formatAudioDetails(details: FileAudio, filename: string): string {
  const { format, quality, specs } = summarizeAudio(details, filename);
  // Song info is the full record, so it names Stereo too.
  const stereo = details?.channels === 2 ? ['Stereo'] : [];
  return [format, quality, ...specs, ...stereo].filter(Boolean).join(' · ');
}
