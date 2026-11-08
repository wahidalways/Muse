import type { LibrarySort, SortDirection } from './library/sortTracks';

export type MusicTrack = {
  id: string;
  title: string;
  folderId: string;
  folderTitle: string;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  year: number | null;
  trackNumber: number | null;
  /** The first genre in the song's tags. */
  genre: string | null;
  filename: string;
  path: string;
  uri: string | null;
  albumArtUri: string | null;
  /** When the file arrived on the phone, in seconds since the epoch. */
  dateAdded: number | null;
  /** The file's filesystem last-modified time, in seconds since the epoch. */
  dateModified: number | null;
  duration: number;
};

export type RepeatMode = 'none' | 'all' | 'single';

export type Screen =
  /** Reading saved state on launch. Shows only the background. */
  | 'starting'
  | 'welcome'
  | 'guidance'
  | 'folders'
  | 'app'
  | 'denied'
  | 'unsupported'
  | 'build-required'
  | 'error';

export type Tab = 'home' | 'library' | 'more' | 'equalizer' | 'settings';

export type MusicFolder = { id: string; title: string; trackCount: number };

export type LibraryView = {
  sortBy: LibrarySort;
  sortDirection: SortDirection;
  tab: Tab;
};

export type ListeningEvent = {
  trackId: string;
  title: string;
  artist: string | null;
  folderTitle: string;
  playedAt: number;
  /** Added later, so older plays may not have these. */
  album?: string | null;
  genre?: string | null;
  /** The song's length when it was played. */
  duration?: number;
  /** How long it was actually heard. Missing for plays saved before timing. */
  listenedSeconds?: number;
};

export type CachedLibrary = {
  folders: MusicFolder[];
  tracks: MusicTrack[];
};

export type DropdownAnchor = { x: number; y: number; width: number; height: number };
