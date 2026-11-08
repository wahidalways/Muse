import type { LibrarySort } from './library/sortTracks';
import type { LibraryView, Tab } from './types';

// AsyncStorage keys for small saved settings.
export const FOLDER_RULES_KEY = '@muse/folder-rules/v1';
export const THEME_KEY = '@muse/theme/v1';
export const ACCENT_KEY = '@muse/accent/v1';
export const AMOLED_KEY = '@muse/amoled/v1';
export const FULL_SCREEN_KEY = '@muse/full-screen/v1';
/** Where older versions kept listening history. Read once, then removed. */
export const LISTENING_HISTORY_KEY = '@muse/listening-history/v1';
/** Listening history, as a JSON file in the app's document folder. */
export const LISTENING_HISTORY_FILE_NAME = 'listening-history-v1.json';
export const LIBRARY_VIEW_KEY = '@muse/library-view/v1';
/** Android's media library fingerprint at the last automatic scan. */
export const LIBRARY_VERSION_KEY = '@muse/library-version/v1';
/** Daily listening goal in minutes. 0 means no goal. */
export const LISTENING_GOAL_KEY = '@muse/listening-goal/v1';
export const LISTENING_GOAL_OPTIONS = [0, 15, 30, 45, 60, 90, 120];

/**
 * The scanned library, stored as a file in the app's document folder.
 * v4 adds each song's genre; v5 drops the test songs v4 builds saved, which
 * cannot play in an APK. Older caches are rescanned.
 */
export const LIBRARY_CACHE_FILE_NAME = 'library-cache-v5.json';
export const LEGACY_LIBRARY_CACHE_FILE_NAMES = [
  'library-cache-v2.json',
  'library-cache-v3.json',
  'library-cache-v4.json',
];
/** Where older versions kept the library cache, removed on launch. */
export const LEGACY_LIBRARY_CACHE_KEYS = [
  '@muse/library-cache/v1',
  '@muse/library-cache/v2',
];

export const MAX_LISTENING_EVENTS = 5000;

export const TABS: Tab[] = ['home', 'library', 'more', 'equalizer', 'settings'];

export const DEFAULT_LIBRARY_VIEW: LibraryView = {
  sortBy: 'title',
  sortDirection: 'ascending',
  tab: 'home',
};

export type LibrarySortOption = {
  id: LibrarySort;
  label: string;
  hint?: string;
};

// One list, most used first, with related sorts side by side.
export const LIBRARY_SORT_OPTIONS: LibrarySortOption[] = [
  { id: 'title', label: 'Title' },
  { id: 'artist', label: 'Artist' },
  { id: 'album', label: 'Album' },
  { id: 'albumArtist', label: 'Album artist' },
  { id: 'dateAdded', label: 'Date added', hint: 'When the file arrived on this phone' },
  { id: 'dateModified', label: 'Date modified', hint: 'When the file itself last changed' },
  { id: 'year', label: 'Year' },
  { id: 'duration', label: 'Duration' },
  { id: 'trackNumber', label: 'Track number' },
  { id: 'filename', label: 'File name' },
  { id: 'path', label: 'Folder', hint: 'Folder path, then file name' },
];

