

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

export const formatSleepTimer = formatTrackDuration;

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
};

/**
 * One line about a file's audio, as "FLAC · 1,411 kbps · 44.1 kHz · Stereo".
 * Parts that are unknown are left out; the format falls back to the file
 * extension.
 */
export function formatAudioDetails(
  details: {
    mimeType: string | null;
    codec: string | null;
    bitrate: number | null;
    sampleRate: number | null;
    channels: number | null;
  } | null,
  filename: string,
): string {
  const extension = filename.includes('.') ? filename.split('.').pop()!.toUpperCase() : '';
  const format =
    (details?.codec && FORMAT_NAMES[details.codec.toLowerCase()]) ||
    (details?.mimeType && FORMAT_NAMES[details.mimeType.toLowerCase()]) ||
    extension;
  const parts = [format];
  if (details?.bitrate && details.bitrate > 0) {
    parts.push(`${Math.round(details.bitrate / 1000).toLocaleString('en-US')} kbps`);
  }
  if (details?.sampleRate && details.sampleRate > 0) {
    parts.push(`${Number((details.sampleRate / 1000).toFixed(1))} kHz`);
  }
  if (details?.channels) {
    parts.push(details.channels === 1 ? 'Mono' : details.channels === 2 ? 'Stereo' : `${details.channels} ch`);
  }
  return parts.filter(Boolean).join(' · ');
}
