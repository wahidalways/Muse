import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import type { ListeningEvent } from '../types';
import {
  LISTENING_HISTORY_FILE_NAME,
  LISTENING_HISTORY_KEY,
  MAX_LISTENING_EVENTS,
} from '../constants';

export function parseListeningHistory(value: string): ListeningEvent[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error('Saved listening history is not valid.');
  }
  // One damaged play is dropped; it must not cost the rest of the history.
  return parsed.filter(isListeningEvent).slice(0, MAX_LISTENING_EVENTS);
}

function isListeningEvent(value: unknown): value is ListeningEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const event = value as Record<string, unknown>;
  return (
    typeof event.trackId === 'string' &&
    typeof event.title === 'string' &&
    (typeof event.artist === 'string' || event.artist === null) &&
    typeof event.folderTitle === 'string' &&
    typeof event.playedAt === 'number' &&
    Number.isFinite(event.playedAt) &&
    isOptionalSeconds(event.listenedSeconds) &&
    isOptionalSeconds(event.duration) &&
    isOptionalText(event.album) &&
    isOptionalText(event.genre)
  );
}

function isOptionalText(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

/** Timing fields were added later, so older plays do not have them. */
function isOptionalSeconds(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

/**
 * History lives in a JSON file, not AsyncStorage. On Android, AsyncStorage
 * cannot read back a value over about 2 MB, and 5,000 plays with long or
 * non-Latin titles can pass that.
 */
function historyFile(): File {
  return new File(Paths.document, LISTENING_HISTORY_FILE_NAME);
}

export async function loadListeningHistory(): Promise<ListeningEvent[]> {
  const file = historyFile();
  if (file.exists) {
    try {
      return parseListeningHistory(await file.text());
    } catch {
      // Kept aside rather than deleted, and history starts again, so one bad
      // file never stops new plays from being saved.
      await file
        .move(new File(Paths.document, `${LISTENING_HISTORY_FILE_NAME}.bad`), {
          overwrite: true,
        })
        .catch(() => undefined);
      return [];
    }
  }
  // Older versions kept history in AsyncStorage. It moves to the file on the
  // first save.
  const saved = await AsyncStorage.getItem(LISTENING_HISTORY_KEY);
  return saved ? parseListeningHistory(saved) : [];
}

let saveQueue: Promise<void> = Promise.resolve();
let hasRemovedLegacyCopy = false;

/**
 * Writes a temporary file, then moves it over the real one, so a crash
 * mid-save never leaves half a file. Saves run one at a time, in order, so
 * an older list can never land after a newer one.
 */
export function saveListeningHistory(history: ListeningEvent[]): Promise<void> {
  const text = JSON.stringify(history);
  const save = saveQueue.then(async () => {
    const temp = new File(Paths.document, `${LISTENING_HISTORY_FILE_NAME}.tmp`);
    await temp.write(text);
    await temp.move(historyFile(), { overwrite: true });
    if (!hasRemovedLegacyCopy) {
      await AsyncStorage.removeItem(LISTENING_HISTORY_KEY);
      hasRemovedLegacyCopy = true;
    }
  });
  // A failed save must not block the ones after it.
  saveQueue = save.catch(() => undefined);
  return save;
}
