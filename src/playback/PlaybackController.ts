import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRunningInExpoGo } from 'expo';
import {
  createAudioPlaylist,
  setAudioModeAsync,
  type AudioMetadata,
  type AudioPlaylist,
  type AudioPlaylistStatus,
} from 'expo-audio';
import { AppState, type AppStateStatus } from 'react-native';

import { getArtworkFile } from '../../modules/muse-audio-metadata';
import { getPreferences } from '../settings/preferences';
import { getTrackSpeed, subscribeTrackSpeeds } from '../library/trackSpeeds';
import { startEqualizer } from '../equalizer/equalizerStore';
import type { MusicTrack, RepeatMode } from '../types';

export const PLAYBACK_STATE_KEY = '@muse/playback-state/v1';

/**
 * The native player only ever holds a small window of the queue: a couple of
 * songs behind the current one and a few ahead. The full queue lives here in
 * JS. Every native playlist call blocks the JS thread on the UI thread and
 * emits a status event, so loading a 600-song queue one `add()` at a time
 * froze the app. A window keeps every queue change to a handful of calls,
 * while lock-screen next/previous still work natively and playback carries
 * on for several songs even if JS is slow to respond.
 */
/**
 * Expo Go is a prebuilt app, so Muse's app.json plugins never reach it and
 * expo-audio's playback service is missing there. Turning on lock-screen
 * controls would only log "service binding failed" on every play. Songs
 * still play in Expo Go; lock-screen controls and background play need a
 * real build.
 */
const CAN_USE_LOCK_SCREEN = !isRunningInExpoGo();

// Every add or remove is a blocking call, so a tap on a song costs one per
// slot. Three ahead still carries the lock screen's Next while JS is slow.
const TRACKS_BEHIND = 1;
const TRACKS_AHEAD = 3;
/**
 * After this controller edits the native queue, reports already on their way
 * describe the old layout. For this long they are skipped without asking the
 * player (each question is another blocking call); a fresh report follows.
 */
const STALE_REPORT_MS = 1000;
const SAVE_INTERVAL_MS = 10_000;
const STATUS_INTERVAL_MS = 1000;
/** Loading shows only when the player has been buffering at least this long. */
const SLOW_LOAD_MS = 900;
/** How long a tap's play or pause wins over reports that were already sent. */
const EXPECTED_STATE_MS = 1500;

export type PlaybackSnapshot = {
  queue: MusicTrack[];
  queueIndex: number;
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  isBuffering: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  error: string;
  /** Increases each time a song starts as a new listen. */
  playRequestId: number;
  /** When the sleep timer pauses playback, as a Date.now() time, or null. */
  sleepTimerEndsAt: number | null;
  /** Where the queue came from ("Library", an album, a playlist), for "Playing from". */
  queueSource: string | null;
};

export type PlaybackProgress = {
  currentTime: number;
  duration: number;
};

type SavedPlaybackState = {
  trackIds: string[];
  currentTrackId: string;
  position: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  /** Queue order before shuffling, so turning shuffle off restores it. */
  originalTrackIds?: string[];
  queueSource?: string;
};

type Listener = () => void;

const INITIAL_SNAPSHOT: PlaybackSnapshot = {
  queue: [],
  queueIndex: 0,
  currentTrack: null,
  isPlaying: false,
  isBuffering: false,
  shuffle: false,
  repeatMode: 'none',
  error: '',
  playRequestId: 0,
  sleepTimerEndsAt: null,
  queueSource: null,
};

export class PlaybackController {
  private readonly player: AudioPlaylist;
  private subscriptions: { remove: () => void }[] = [];
  private snapshot: PlaybackSnapshot = INITIAL_SNAPSHOT;
  private progress: PlaybackProgress = { currentTime: 0, duration: 0 };
  private readonly snapshotListeners = new Set<Listener>();
  private readonly progressListeners = new Set<Listener>();
  /** Queue index of each song loaded in the native player, in native order. */
  private window: number[] = [];
  /** Native index of the current song, as this controller last left it. */
  private nativeIndex = 0;
  private originalQueue: MusicTrack[] = [];
  private isLockScreenActive = false;
  /** The song the lock screen shows, so a resume does not resend it. */
  private lockScreenTrack: MusicTrack | null = null;
  private artworkRequest = 0;
  /** When this controller last changed the native queue or its position. */
  private windowEditedAt = 0;
  private hasCountedCurrentListen = false;
  /**
   * After a play or pause, the state the player was told to reach. Until it
   * reports that state (or a short while passes), older reports that were
   * already on their way are not allowed to flip the button back.
   */
  private expectedPlaying: { playing: boolean; until: number } | null = null;
  private expectedPlayingTimer: ReturnType<typeof setTimeout> | null = null;
  /** When the player started reporting "buffering", or null. */
  private bufferingSince: number | null = null;
  /** Seconds heard of the current listen, and of the one before it. */
  private listenSeconds = 0;
  private finishedListenSeconds = 0;
  private lastStatusAt = 0;
  private audioModeReady: Promise<void> | null = null;
  private canPersist = false;
  private lastSavedAt = 0;
  /**
   * Restored position, applied once the song has loaded. A seek sent before
   * that is dropped, and the first report of 0:00 would then be saved.
   */
  private pendingSeek: number | null = null;
  private isApplyingSeek = false;
  /** Last report that said playing, to tell a disconnect mid-song from one while paused. */
  private lastPlayingAt = 0;
  /** Playback speed; 1 is normal. */
  private speed = 1;
  // Fade between songs (Settings › Playback › Crossfade).
  /** The song started by a faded ending, so it fades in. */
  private fadeInCurrent = false;
  /** The song is in its fade-out, so the next one should fade in. */
  private isFadingOut = false;
  private appliedVolume = 1;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.player = createAudioPlaylist({
      sources: [],
      updateInterval: STATUS_INTERVAL_MS,
      loop: 'none',
    });
    // Equalizer effects ride on this player's audio session.
    startEqualizer(this.player);
    // The controller lives for the whole app session. These are only removed
    // by `dispose`, when development code reloads replace it.
    this.subscriptions = [
      this.player.addListener('playlistStatusUpdate', this.handleStatus),
      this.player.addListener('trackChanged', this.handleTrackChanged),
      AppState.addEventListener('change', this.handleAppStateChange),
      // A song's saved speed can change (or load) at any time.
      { remove: subscribeTrackSpeeds(this.applyTrackSpeed) },
    ];
  }

  /** Stops and releases the native player. Development reloads only. */
  dispose() {
    this.pendingLoad = null;
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
    if (this.expectedPlayingTimer) {
      clearTimeout(this.expectedPlayingTimer);
    }
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
    }
    this.snapshotListeners.clear();
    this.progressListeners.clear();
    try {
      this.player.pause();
      this.player.release();
    } catch {
      // Already released.
    }
  }

  // ---------------------------------------------------------------------------
  // Store plumbing for useSyncExternalStore

  subscribe = (listener: Listener) => {
    this.snapshotListeners.add(listener);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  subscribeProgress = (listener: Listener) => {
    this.progressListeners.add(listener);
    return () => {
      this.progressListeners.delete(listener);
    };
  };

  getProgress = () => this.progress;

  /** Seconds heard so far of the current listen. */
  getListenSeconds = () => this.listenSeconds;

  /** Seconds heard of the listen that ended when the current one started. */
  getFinishedListenSeconds = () => this.finishedListenSeconds;

  private update(partial: Partial<PlaybackSnapshot>) {
    this.snapshot = { ...this.snapshot, ...partial };
    this.snapshotListeners.forEach((listener) => listener());
  }

  private updateProgress(next: PlaybackProgress) {
    if (
      next.currentTime === this.progress.currentTime &&
      next.duration === this.progress.duration
    ) {
      return;
    }
    this.progress = next;
    this.progressListeners.forEach((listener) => listener());
  }

  /**
   * Shows play or pause right away instead of waiting up to a second for the
   * player's next report, so the button and progress bar respond on tap.
   */
  private expectPlaying(playing: boolean) {
    this.expectedPlaying = { playing, until: Date.now() + EXPECTED_STATE_MS };
    if (this.snapshot.isPlaying !== playing || this.snapshot.isBuffering) {
      this.update({ isPlaying: playing, isBuffering: false });
    }
    // A failed play (missing file, a phone call holding audio) can send its
    // last report inside the window, or none at all. Ask the player after.
    if (this.expectedPlayingTimer) {
      clearTimeout(this.expectedPlayingTimer);
    }
    this.expectedPlayingTimer = setTimeout(() => {
      this.expectedPlayingTimer = null;
      this.expectedPlaying = null;
      const actual = this.player.playing;
      if (actual !== this.snapshot.isPlaying) {
        this.update({ isPlaying: actual, isBuffering: false });
      }
    }, EXPECTED_STATE_MS + 100);
  }

  /**
   * Switches the current song, with its position reset to the start at once.
   * Otherwise the progress bar keeps the old song's position until the
   * player's next report and jumps back a moment later.
   */
  private showTrack(partial: Partial<PlaybackSnapshot> & { currentTrack: MusicTrack | null }) {
    const isNewSong = partial.currentTrack?.id !== this.snapshot.currentTrack?.id;
    if (isNewSong) {
      this.pendingSeek = null;
      this.updateProgress({ currentTime: 0, duration: partial.currentTrack?.duration ?? 0 });
    }
    this.update(partial);
    if (isNewSong) {
      this.applyTrackSpeed();
    }
  }

  // ---------------------------------------------------------------------------
  // Public actions

  /** Sets the audio session once. Background play depends on it. */
  ensureAudioMode = (): Promise<void> => {
    if (!this.audioModeReady) {
      this.audioModeReady = setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        allowsRecording: false,
        shouldPlayInBackground: true,
        shouldRouteThroughEarpiece: false,
      }).catch((error: unknown) => {
        this.audioModeReady = null;
        throw error;
      });
    }
    return this.audioModeReady;
  };

  /**
   * Plays `track`, queueing the other playable songs after it. Tapping the
   * current song resumes it where it left off and never pauses it (the list
   * opens the full player instead), unless `freshQueue` is set: Play and
   * Shuffle buttons always start the new list, even on the current song.
   */
  playTrack = async (
    track: MusicTrack,
    playableTracks: MusicTrack[],
    {
      freshQueue = false,
      source,
    }: {
      freshQueue?: boolean;
      /** Where this list is from, shown as "Playing from" in the full player. */
      source?: string;
    } = {},
  ) => {
    if (!track.uri) {
      this.setError('This song is not available on your device.');
      return;
    }

    this.setError('');
    this.flushPendingLoad();
    try {
      await this.ensureAudioMode();

      if (!freshQueue && this.snapshot.currentTrack?.id === track.id) {
        if (!this.snapshot.isPlaying) {
          await this.resume();
        }
        return;
      }

      // The songs after the tapped one come next, then the ones before it,
      // as in a music app's list (and Next still wraps to the start).
      const start = playableTracks.findIndex((item) => item.id === track.id);
      const fromTapped =
        start < 0
          ? playableTracks
          : [...playableTracks.slice(start + 1), ...playableTracks.slice(0, start)];
      const orderedTracks = [
        track,
        ...fromTapped.filter((item) => item.id !== track.id && item.uri),
      ];
      this.originalQueue = orderedTracks;
      const queue = this.snapshot.shuffle
        ? [track, ...shuffleTracks(orderedTracks.slice(1))]
        : orderedTracks;

      // The screen shows the new song (and Pause) first; the native queue, a
      // run of blocking calls, loads once that frame is up, so a tap never
      // looks stuck. Reports until then describe the old queue.
      this.windowEditedAt = Date.now();
      this.showTrack({ queue, queueIndex: 0, currentTrack: track, queueSource: source ?? null });
      this.hasCountedCurrentListen = false;
      this.expectPlaying(true);
      this.deferLoad(() => {
        this.loadWindowAt(0);
        this.startPlayback();
      });
    } catch (error) {
      this.setError(
        error instanceof Error ? error.message : 'Could not play this song.',
      );
    }
  };

  /** A queue load waiting for the frame that shows its song. */
  private pendingLoad: (() => void) | null = null;

  private deferLoad(load: () => void) {
    this.pendingLoad = load;
    // Two frames: the first mounts the new screen, the second has drawn it.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (this.pendingLoad === load) {
          this.flushPendingLoad();
        }
      }),
    );
  }

  /**
   * Runs a load still waiting for its frame. Every other action calls this
   * first, so nothing ever acts on a half-loaded queue.
   */
  private flushPendingLoad() {
    const load = this.pendingLoad;
    if (!load) {
      return;
    }
    this.pendingLoad = null;
    try {
      load();
    } catch (error) {
      this.setError(error instanceof Error ? error.message : 'Could not play this song.');
    }
  }

  /**
   * Android pauses by itself when headphones or Bluetooth audio disconnect.
   * With "Pause on disconnect" off, this plays on, through the speaker, but
   * only if music was actually playing when it happened.
   */
  resumeAfterDisconnect = () => {
    this.flushPendingLoad();
    if (!this.snapshot.currentTrack || Date.now() - this.lastPlayingAt > 2000) {
      return;
    }
    // After the player's own pause lands, so it does not undo this.
    setTimeout(() => {
      if (!this.player.playing) {
        this.player.play();
        this.expectPlaying(true);
      }
    }, 400);
  };

  /**
   * Plays the current song at its own saved speed (1x unless set in the
   * player). Pitch stays natural (ExoPlayer's speed setting); the progress
   * bar reads it.
   */
  private applyTrackSpeed = () => {
    const track = this.snapshot.currentTrack;
    const speed = track ? getTrackSpeed(track.id) : 1;
    if (speed !== this.speed) {
      this.speed = speed;
      this.player.playbackRate = speed;
      // The progress bar re-times its glide for the new speed right away.
      this.progressListeners.forEach((listener) => listener());
    }
  };

  getPlaybackSpeed = () => this.speed;

  togglePlayback = () => {
    this.flushPendingLoad();
    if (this.snapshot.isPlaying) {
      this.player.pause();
      this.expectPlaying(false);
      return;
    }
    if (!this.snapshot.currentTrack) {
      return;
    }
    this.setError('');
    this.ensureAudioMode()
      .then(() => this.resume())
      .catch((error: unknown) => {
        this.setError(
          error instanceof Error ? error.message : 'Could not play this song.',
        );
      });
  };

  pause = () => {
    this.flushPendingLoad();
    this.player.pause();
    this.expectPlaying(false);
  };

  // A tap on next or previous always moves, wrapping around the ends of the
  // queue, so two songs never strand you on the last one. Only a song ending
  // by itself stops at the end, unless repeat is on (see `neighbour`).
  /**
   * The song Next (1) or Previous (-1) would move to, or null when it would
   * not move: Previous restarts the song instead once it is past 3 seconds.
   * The mini player reads it to show the next title before the skip lands.
   */
  trackAfterSkip = (direction: 1 | -1): MusicTrack | null => {
    const { queue, queueIndex } = this.snapshot;
    if (queue.length < 2 || (direction === -1 && this.progress.currentTime > 3)) {
      return null;
    }
    return queue[(queueIndex + direction + queue.length) % queue.length] ?? null;
  };

  skipNext = () => {
    this.flushPendingLoad();
    const { queue, queueIndex } = this.snapshot;
    if (!this.trackAfterSkip(1)) {
      return;
    }
    // Paused stays paused: Next and Previous move, they do not press play.
    this.skipToQueueIndex((queueIndex + 1) % queue.length, this.snapshot.isPlaying);
  };

  skipPrevious = () => {
    this.flushPendingLoad();
    const { queue, queueIndex } = this.snapshot;
    if (!this.trackAfterSkip(-1)) {
      this.pendingSeek = null;
      void this.player.seekTo(0);
      return;
    }
    this.skipToQueueIndex((queueIndex - 1 + queue.length) % queue.length, this.snapshot.isPlaying);
  };

  /** `play` false loads the song at its start and leaves it paused. */
  skipToQueueIndex = (queueIndex: number, play = true) => {
    this.flushPendingLoad();
    // A skip you chose cuts over at once; only a song ending on its own fades.
    this.resetFade();
    const track = this.snapshot.queue[queueIndex];
    if (!track) {
      return;
    }

    const nativePosition = this.findInWindow(queueIndex);
    if (nativePosition === null) {
      this.showTrack({ queueIndex, currentTrack: track });
      this.loadWindowAt(queueIndex);
    } else {
      this.player.skipTo(nativePosition);
      this.nativeIndex = nativePosition;
      this.windowEditedAt = Date.now();
      this.showTrack({ queueIndex, currentTrack: track });
      this.refillWindow();
    }
    this.hasCountedCurrentListen = false;
    this.setError('');
    if (!play) {
      // The player keeps its paused state across a skip; only the lock
      // screen and the saved spot need the new song.
      this.updateLockScreen(track);
      this.save();
      return;
    }
    this.ensureAudioMode()
      .then(() => this.startPlayback())
      .catch((error: unknown) => {
        this.setError(
          error instanceof Error ? error.message : 'Could not play this song.',
        );
      });
  };

  toggleShuffle = () => {
    this.flushPendingLoad();
    this.syncWithNativeTrack();
    const { queue, queueIndex, currentTrack, shuffle } = this.snapshot;
    const nextShuffle = !shuffle;
    if (queue.length < 2 || !currentTrack) {
      this.update({ shuffle: nextShuffle });
      this.save();
      return;
    }

    let nextQueue: MusicTrack[];
    let nextIndex: number;
    if (nextShuffle) {
      nextQueue = [
        currentTrack,
        ...shuffleTracks(queue.filter((_, index) => index !== queueIndex)),
      ];
      nextIndex = 0;
    } else {
      const originalIndex = this.originalQueue.findIndex(
        (track) => track.id === currentTrack.id,
      );
      if (originalIndex >= 0) {
        nextQueue = this.originalQueue;
        nextIndex = originalIndex;
      } else {
        nextQueue = [
          currentTrack,
          ...queue.filter((_, index) => index !== queueIndex),
        ];
        nextIndex = 0;
      }
    }

    this.update({ queue: nextQueue, queueIndex: nextIndex, shuffle: nextShuffle });
    this.resetWindowAroundCurrent();
    this.save();
  };

  cycleRepeatMode = () => {
    this.flushPendingLoad();
    this.syncWithNativeTrack();
    const { repeatMode } = this.snapshot;
    const nextMode: RepeatMode =
      repeatMode === 'none' ? 'all' : repeatMode === 'all' ? 'single' : 'none';
    // Repeat-all wraps the queue in JS (see `neighbour`), so the native player
    // only needs to know about single-song looping. Changing the property in
    // place never interrupts the current song.
    this.player.loop = nextMode === 'single' ? 'single' : 'none';
    this.update({ repeatMode: nextMode });
    this.resetWindowAroundCurrent();
    this.save();
  };

  seekToRatio = (ratio: number) => {
    this.flushPendingLoad();
    const { duration } = this.progress;
    if (duration <= 0) {
      return;
    }
    const position = Math.max(0, Math.min(1, ratio)) * duration;
    this.pendingSeek = null;
    this.updateProgress({ currentTime: position, duration });
    void this.player.seekTo(position);
  };

  /**
   * Pauses playback after `minutes`. Checked on each native status update,
   * not with a JS timer: Android stops JS timers while the app is in the
   * background, which is exactly when a sleep timer runs.
   */
  startSleepTimer = (minutes: number) => {
    this.update({
      sleepTimerEndsAt: Date.now() + minutes * 60 * 1000,
      error: '',
    });
  };

  clearSleepTimer = () => {
    if (this.snapshot.sleepTimerEndsAt !== null) {
      this.update({ sleepTimerEndsAt: null });
    }
  };

  setError = (message: string) => {
    if (message !== this.snapshot.error) {
      this.update({ error: message });
    }
  };

  /**
   * Swaps in the library's latest copies of queued songs, keeping the order
   * and the current position. Without this the player keeps showing the
   * details (title, artwork) a song had when it was queued, even after a
   * rescan updates them.
   */
  syncTracks = (libraryTracks: MusicTrack[]) => {
    const { queue, currentTrack } = this.snapshot;
    if (queue.length === 0) {
      return;
    }
    const latest = new Map(libraryTracks.map((track) => [track.id, track]));
    const refresh = (track: MusicTrack) => latest.get(track.id) ?? track;
    const nextQueue = queue.map(refresh);
    this.originalQueue = this.originalQueue.map(refresh);
    if (nextQueue.every((track, index) => track === queue[index])) {
      return;
    }
    const nextCurrent = currentTrack ? refresh(currentTrack) : null;
    this.update({ queue: nextQueue, currentTrack: nextCurrent });
    if (nextCurrent && nextCurrent !== currentTrack) {
      this.updateLockScreen(nextCurrent);
    }
  };

  /**
   * Moves an upcoming song to another upcoming spot (Up Next drag). The
   * current song never moves, so playback is not interrupted.
   */
  moveQueueItem = (from: number, to: number) => {
    this.flushPendingLoad();
    this.syncWithNativeTrack();
    const { queue, queueIndex, shuffle } = this.snapshot;
    const isUpcoming = (index: number) => index > queueIndex && index < queue.length;
    if (from === to || !isUpcoming(from) || !isUpcoming(to)) {
      return;
    }
    const nextQueue = [...queue];
    const [moved] = nextQueue.splice(from, 1);
    nextQueue.splice(to, 0, moved);
    // A hand-made order becomes the order to return to when shuffle is off.
    if (!shuffle) {
      this.originalQueue = nextQueue;
    }
    this.update({ queue: nextQueue });
    this.resetWindowAroundCurrent();
    this.save();
  };

  /** Takes one upcoming song out of the queue. It stays in the library. */
  removeFromQueue = (index: number) => {
    this.flushPendingLoad();
    this.syncWithNativeTrack();
    const { queue, queueIndex, shuffle } = this.snapshot;
    if (index <= queueIndex || index >= queue.length) {
      return;
    }
    const removed = queue[index];
    const nextQueue = queue.filter((_, position) => position !== index);
    this.originalQueue = shuffle
      ? this.originalQueue.filter((track) => track.id !== removed.id)
      : nextQueue;
    this.update({ queue: nextQueue });
    this.resetWindowAroundCurrent();
    this.save();
  };

  /**
   * Takes a deleted song out of the queue. If it was playing, the next song
   * takes its place, and keeps playing if music was on.
   */
  removeTrack = (trackId: string) => {
    this.flushPendingLoad();
    this.syncWithNativeTrack();
    const { queue, queueIndex, currentTrack, isPlaying } = this.snapshot;
    const index = queue.findIndex((track) => track.id === trackId);
    this.originalQueue = this.originalQueue.filter((track) => track.id !== trackId);
    if (index < 0) {
      return;
    }
    const nextQueue = queue.filter((track) => track.id !== trackId);
    if (currentTrack?.id !== trackId) {
      this.update({ queue: nextQueue, queueIndex: index < queueIndex ? queueIndex - 1 : queueIndex });
      this.resetWindowAroundCurrent();
      this.save();
      return;
    }
    if (nextQueue.length === 0) {
      this.player.pause();
      this.player.clear();
      this.windowEditedAt = Date.now();
      this.window = [];
      this.nativeIndex = 0;
      this.update({ queue: [], queueIndex: 0, currentTrack: null, isPlaying: false });
      this.updateProgress({ currentTime: 0, duration: 0 });
      return;
    }
    const nextIndex = Math.min(index, nextQueue.length - 1);
    this.showTrack({ queue: nextQueue, queueIndex: nextIndex, currentTrack: nextQueue[nextIndex] });
    this.loadWindowAt(nextIndex);
    this.hasCountedCurrentListen = false;
    if (isPlaying) {
      this.startPlayback();
    } else {
      this.updateLockScreen(nextQueue[nextIndex]);
      this.save();
    }
  };

  /** Allows saving once there is nothing left to restore. */
  enablePersistence = () => {
    this.canPersist = true;
  };

  /** Restores the saved queue, paused, from the given library. */
  restore = async (libraryTracks: MusicTrack[], blockedFolderIds: string[]) => {
    try {
      const savedValue = await AsyncStorage.getItem(PLAYBACK_STATE_KEY);
      if (!savedValue) {
        return;
      }

      if (this.snapshot.currentTrack) {
        // Something started playing while the library was loading.
        return;
      }
      const savedState = parseSavedPlaybackState(savedValue);
      const blocked = new Set(blockedFolderIds);
      const availableTracks = new Map(
        libraryTracks
          .filter((track) => track.uri && !blocked.has(track.folderId))
          .map((track) => [track.id, track]),
      );
      const toTracks = (ids: string[]) =>
        ids
          .map((trackId) => availableTracks.get(trackId))
          .filter((track): track is MusicTrack => track !== undefined);
      const queue = toTracks(savedState.trackIds);
      const queueIndex = queue.findIndex(
        (track) => track.id === savedState.currentTrackId,
      );
      if (queueIndex < 0) {
        return;
      }

      const track = queue[queueIndex];
      const position =
        track.duration > 0
          ? Math.min(savedState.position, track.duration)
          : savedState.position;
      this.originalQueue =
        savedState.shuffle && savedState.originalTrackIds
          ? toTracks(savedState.originalTrackIds)
          : queue;
      this.player.loop = savedState.repeatMode === 'single' ? 'single' : 'none';
      this.update({
        queue,
        queueIndex,
        currentTrack: track,
        shuffle: savedState.shuffle,
        repeatMode: savedState.repeatMode,
        queueSource: typeof savedState.queueSource === 'string' ? savedState.queueSource : null,
      });
      this.loadWindowAt(queueIndex);
      this.applyTrackSpeed();
      this.hasCountedCurrentListen = false;
      this.pendingSeek = position > 0 ? position : null;
      this.updateProgress({ currentTime: position, duration: track.duration });
    } catch (error) {
      this.setError(
        error instanceof Error
          ? error.message
          : 'Could not restore your player settings.',
      );
    } finally {
      this.canPersist = true;
    }
  };

  // ---------------------------------------------------------------------------
  // Native player events

  private handleStatus = (status: AudioPlaylistStatus) => {
    const { sleepTimerEndsAt } = this.snapshot;
    if (
      sleepTimerEndsAt !== null &&
      Date.now() >= sleepTimerEndsAt &&
      !this.snapshot.isPlaying
    ) {
      // Ran out while already paused: this play came from the lock screen or
      // a headset, so it must not be stopped.
      this.update({ sleepTimerEndsAt: null });
    } else if (sleepTimerEndsAt !== null && Date.now() >= sleepTimerEndsAt) {
      this.player.pause();
      this.update({
        sleepTimerEndsAt: null,
        error: 'Sleep timer ended. Playback paused.',
      });
    }

    if (status.currentIndex !== this.nativeIndex) {
      // Queued while this controller edited the queue: about the old layout.
      if (this.isStaleReport()) {
        return;
      }
      this.syncWithNativeTrack();
      // Still about another song while the player agrees with us: a report
      // from before a skip. A fresh one follows within a second.
      if (status.currentIndex !== this.nativeIndex) {
        return;
      }
    }

    // Count steady playback only. A seek or song change moves the position by
    // a different amount than the clock did, so it is left out. Comparing with
    // the clock, not a fixed step, keeps slower background updates counted.
    const now = Date.now();
    const step = status.currentTime - this.progress.currentTime;
    const clockStep = (now - this.lastStatusAt) / 1000;
    this.lastStatusAt = now;
    if (
      status.playing &&
      this.snapshot.isPlaying &&
      step > 0 &&
      Math.abs(step - clockStep) < 1.5
    ) {
      this.listenSeconds += step;
    }

    const pendingSeek = this.pendingSeek;
    if (pendingSeek === null) {
      this.updateProgress({
        currentTime: status.currentTime,
        duration: status.duration,
      });
      this.applyFade(status.currentTime, status.playing);
    } else if (
      status.isLoaded &&
      status.currentIndex === this.nativeIndex &&
      !this.isApplyingSeek
    ) {
      // Keep showing (and saving) the restored time until the seek lands.
      this.isApplyingSeek = true;
      void this.player.seekTo(pendingSeek).finally(() => {
        this.isApplyingSeek = false;
        if (this.pendingSeek === pendingSeek) {
          this.pendingSeek = null;
        }
      });
    }

    const wasPlaying = this.snapshot.isPlaying;
    if (status.playing) {
      this.lastPlayingAt = now;
    }
    let playing = status.playing;
    const nativeError = (status as { error?: { message?: string } }).error;
    const expected = nativeError ? null : this.expectedPlaying;
    if (nativeError) {
      this.expectedPlaying = null;
    }
    if (expected) {
      if (status.playing === expected.playing || Date.now() > expected.until) {
        this.expectedPlaying = null;
      } else {
        // A report from before the tap. Keep what the tap asked for.
        playing = expected.playing;
      }
    }
    // Local files buffer for milliseconds, but the flag can sit in a report
    // for a whole second. Only show loading once it lasts past one report.
    if (!status.isBuffering) {
      this.bufferingSince = null;
    } else if (this.bufferingSince === null) {
      this.bufferingSince = now;
    }
    const isBuffering =
      this.bufferingSince !== null && now - this.bufferingSince >= SLOW_LOAD_MS;
    if (playing !== wasPlaying || isBuffering !== this.snapshot.isBuffering) {
      this.update({ isPlaying: playing, isBuffering });
    }

    if (nativeError) {
      this.setError('This song could not be played.');
    }

    if (wasPlaying && !playing) {
      this.save();
    } else if (
      playing &&
      Date.now() - this.lastSavedAt >= SAVE_INTERVAL_MS
    ) {
      this.save();
    }
  };

  /**
   * Reconciles with the song the native player is actually on. Event payloads
   * can be stale (they are queued while this controller edits the window, and
   * the native `trackChanged` check misses changes after the window shifts),
   * so this always reads the live index.
   */
  private syncWithNativeTrack = () => {
    if (this.window.length === 0) {
      return;
    }
    const liveIndex = this.player.currentIndex;
    if (liveIndex === this.nativeIndex) {
      return;
    }
    const queueIndex = this.window[liveIndex];
    const track =
      queueIndex === undefined ? undefined : this.snapshot.queue[queueIndex];
    if (queueIndex === undefined || !track) {
      return;
    }

    this.nativeIndex = liveIndex;
    const isNewSong = track.id !== this.snapshot.currentTrack?.id;
    this.showTrack({ queueIndex, currentTrack: track });
    this.refillWindow();
    if (isNewSong) {
      this.fadeInCurrent = this.isFadingOut;
      this.isFadingOut = false;
      this.hasCountedCurrentListen = false;
      this.updateLockScreen(track);
      if (this.snapshot.isPlaying) {
        this.countListen();
      }
    }
    this.save();
  };

  /** Clears, adds and skips fire these too; only a real song change needs a look. */
  private handleTrackChanged = () => {
    if (!this.isStaleReport()) {
      this.syncWithNativeTrack();
    }
  };

  private isStaleReport() {
    return Date.now() - this.windowEditedAt < STALE_REPORT_MS;
  }

  private handleAppStateChange = (state: AppStateStatus) => {
    if (state !== 'active') {
      // Frames stop in the background, so a waiting load runs now.
      this.flushPendingLoad();
      this.save();
    }
  };

  // ---------------------------------------------------------------------------
  // Window management

  /** Queue index one step away, wrapping only when repeating all. */
  private neighbour(queueIndex: number, step: 1 | -1): number | null {
    const { queue, repeatMode } = this.snapshot;
    const target = queueIndex + step;
    if (target >= 0 && target < queue.length) {
      return target;
    }
    if (repeatMode === 'all' && queue.length > 0) {
      return (target + queue.length) % queue.length;
    }
    return null;
  }

  private findInWindow(queueIndex: number): number | null {
    for (let index = this.nativeIndex + 1; index < this.window.length; index += 1) {
      if (this.window[index] === queueIndex) {
        return index;
      }
    }
    for (let index = this.nativeIndex; index >= 0; index -= 1) {
      if (this.window[index] === queueIndex) {
        return index;
      }
    }
    return null;
  }

  /** Replaces the native playlist with a fresh window centred on a song. */
  private loadWindowAt(queueIndex: number) {
    this.pendingSeek = null;
    this.resetFade();
    const indices = [queueIndex];
    for (let count = 0; count < TRACKS_BEHIND; count += 1) {
      const previous = this.neighbour(indices[0], -1);
      if (previous === null) {
        break;
      }
      indices.unshift(previous);
    }
    const currentPosition = indices.length - 1;
    for (let count = 0; count < TRACKS_AHEAD; count += 1) {
      const next = this.neighbour(indices[indices.length - 1], 1);
      if (next === null) {
        break;
      }
      indices.push(next);
    }

    this.player.clear();
    this.window = [];
    indices.forEach((index) => {
      const track = this.snapshot.queue[index];
      if (track?.uri) {
        this.player.add({ uri: track.uri, name: track.title });
        this.window.push(index);
      }
    });
    const nativePosition = this.window.lastIndexOf(
      queueIndex,
      Math.min(currentPosition, this.window.length - 1),
    );
    this.nativeIndex = Math.max(0, nativePosition);
    this.player.skipTo(this.nativeIndex);
    this.windowEditedAt = Date.now();
  }

  /** Keeps the current song playing and rebuilds the songs around it. */
  private resetWindowAroundCurrent() {
    if (this.window.length === 0) {
      return;
    }
    for (let index = this.window.length - 1; index > this.nativeIndex; index -= 1) {
      this.player.remove(index);
    }
    for (let count = 0; count < this.nativeIndex; count += 1) {
      this.player.remove(0);
    }
    this.window = [this.snapshot.queueIndex];
    this.nativeIndex = 0;
    this.refillWindow();
    this.windowEditedAt = Date.now();
  }

  /** Trims played songs and tops the window up behind and ahead. */
  private refillWindow() {
    const { queue } = this.snapshot;
    if (queue.length === 0 || this.window.length === 0) {
      return;
    }

    while (this.nativeIndex > TRACKS_BEHIND) {
      this.player.remove(0);
      this.window.shift();
      this.nativeIndex -= 1;
    }

    while (this.nativeIndex < TRACKS_BEHIND) {
      const previous = this.neighbour(this.window[0], -1);
      const track = previous === null ? undefined : queue[previous];
      if (previous === null || !track?.uri) {
        break;
      }
      this.player.insert({ uri: track.uri, name: track.title }, 0);
      this.window.unshift(previous);
      this.nativeIndex += 1;
    }

    while (this.window.length - 1 - this.nativeIndex < TRACKS_AHEAD) {
      const next = this.neighbour(this.window[this.window.length - 1], 1);
      const track = next === null ? undefined : queue[next];
      if (next === null || !track?.uri) {
        break;
      }
      this.player.add({ uri: track.uri, name: track.title });
      this.window.push(next);
    }
    this.windowEditedAt = Date.now();
  }

  // ---------------------------------------------------------------------------
  // Fade between songs. The engine plays one song at a time, so this is a
  // fade-out at the end and a fade-in at the start, not an overlap. Reports
  // arrive once a second, which keeps it going in the background; while the
  // app is open a short timer smooths the steps.

  /** Volume for `position` seconds into the current song. */
  private fadeVolume(position: number): { volume: number; fadingOut: boolean } {
    const fade = getPreferences().crossfadeSeconds;
    const { duration } = this.progress;
    if (fade <= 0 || duration <= 0) {
      return { volume: 1, fadingOut: false };
    }
    // Short songs fade over a third of their length at most.
    const span = Math.min(fade, duration / 3);
    const hasNext =
      this.snapshot.repeatMode !== 'single' &&
      this.neighbour(this.snapshot.queueIndex, 1) !== null;
    const out = hasNext ? Math.min(1, Math.max(0, (duration - position) / span)) : 1;
    const into = this.fadeInCurrent ? Math.min(1, Math.max(0, position / span)) : 1;
    return { volume: Math.min(out, into), fadingOut: out < 1 };
  }

  private applyFade(position: number, playing: boolean) {
    const { volume, fadingOut } = this.fadeVolume(position);
    this.isFadingOut = fadingOut;
    if (this.fadeInCurrent && volume >= 1 && !fadingOut) {
      this.fadeInCurrent = false;
    }
    if (Math.abs(volume - this.appliedVolume) > 0.005) {
      this.appliedVolume = volume;
      this.player.volume = volume;
    }
    const shouldTick = volume < 1 && playing;
    if (shouldTick && !this.fadeTimer) {
      this.fadeTimer = setInterval(this.tickFade, 50);
    } else if (!shouldTick && this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  /** Between reports, estimates the position from the clock. */
  private tickFade = () => {
    const sinceReport = Math.min(1.5, (Date.now() - this.lastStatusAt) / 1000);
    this.applyFade(this.progress.currentTime + sinceReport * this.speed, this.snapshot.isPlaying);
  };

  private resetFade() {
    this.fadeInCurrent = false;
    this.isFadingOut = false;
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    if (this.appliedVolume !== 1) {
      this.appliedVolume = 1;
      this.player.volume = 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Playback helpers

  private async resume() {
    const { currentTime, duration } = this.progress;
    if (this.pendingSeek !== null) {
      // Played before the player reported the song loaded.
      await this.player.seekTo(this.pendingSeek);
      this.pendingSeek = null;
    } else if (duration > 0 && currentTime >= duration - 0.5) {
      await this.player.seekTo(0);
      this.hasCountedCurrentListen = false;
    }
    this.startPlayback();
  }

  private startPlayback() {
    const track = this.snapshot.currentTrack;
    if (!track) {
      return;
    }
    // A timer that ran out while already paused must not stop this play.
    const { sleepTimerEndsAt } = this.snapshot;
    if (sleepTimerEndsAt !== null && Date.now() >= sleepTimerEndsAt) {
      this.update({ sleepTimerEndsAt: null });
    }
    if (this.isLockScreenActive) {
      this.updateLockScreen(track);
    } else if (CAN_USE_LOCK_SCREEN) {
      this.player.setActiveForLockScreen(true, lockScreenMetadata(track), {
        showNextTrack: true,
        showPreviousTrack: true,
      });
      this.isLockScreenActive = true;
      this.loadLockScreenArtwork(track);
    }
    this.player.play();
    this.expectPlaying(true);
    this.countListen();
    this.save();
  }

  /** Counts one listen per song, not one per pause and resume. */
  private countListen() {
    if (this.hasCountedCurrentListen) {
      return;
    }
    this.hasCountedCurrentListen = true;
    this.finishedListenSeconds = this.listenSeconds;
    this.listenSeconds = 0;
    this.update({ playRequestId: this.snapshot.playRequestId + 1 });
  }

  /** Only when the song (or its details) changed: a resume needs nothing new. */
  private updateLockScreen(track: MusicTrack) {
    if (this.isLockScreenActive && track !== this.lockScreenTrack) {
      this.loadLockScreenArtwork(track);
    }
  }

  /**
   * One update per song, title and cover together, once the cover file is
   * ready. Sent after the tap's own work, not during it: each update is a
   * blocking call and rebuilds the media notification, and a title-only
   * update first would clear the cover and make it decode again. Library
   * artwork uses content:// uris, which the lock screen cannot load, so it
   * gets a file:// copy instead.
   */
  private loadLockScreenArtwork(track: MusicTrack) {
    this.lockScreenTrack = track;
    const request = ++this.artworkRequest;
    void getArtworkFile(track.id)
      .catch(() => null)
      .then((artworkUrl) => {
        if (request !== this.artworkRequest || !this.isLockScreenActive) {
          return;
        }
        try {
          this.player.updateLockScreenMetadata(
            artworkUrl ? { ...lockScreenMetadata(track), artworkUrl } : lockScreenMetadata(track),
          );
        } catch {
          // The controls are already showing; the details catch up next song.
        }
      });
  }

  private save() {
    const { queue, currentTrack, shuffle, repeatMode } = this.snapshot;
    if (!this.canPersist || !currentTrack || queue.length === 0) {
      return;
    }
    this.lastSavedAt = Date.now();
    const savedState: SavedPlaybackState = {
      trackIds: queue.map((track) => track.id),
      currentTrackId: currentTrack.id,
      position: Math.max(0, this.progress.currentTime),
      shuffle,
      repeatMode,
      ...(shuffle
        ? { originalTrackIds: this.originalQueue.map((track) => track.id) }
        : {}),
      ...(this.snapshot.queueSource ? { queueSource: this.snapshot.queueSource } : {}),
    };
    AsyncStorage.setItem(PLAYBACK_STATE_KEY, JSON.stringify(savedState)).catch(
      (error: unknown) => {
        this.setError(
          error instanceof Error
            ? error.message
            : 'Could not save your player settings.',
        );
      },
    );
  }
}

/** Text-only lock-screen details. Artwork is added by `loadLockScreenArtwork`. */
function lockScreenMetadata(track: MusicTrack): AudioMetadata {
  return {
    title: track.title,
    artist: track.artist || 'Unknown artist',
    albumTitle: track.album || track.folderTitle,
  };
}

export function shuffleTracks(tracksToShuffle: MusicTrack[]): MusicTrack[] {
  const shuffled = [...tracksToShuffle];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function parseSavedPlaybackState(value: string): SavedPlaybackState {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Saved player settings are not valid.');
  }
  const state = parsed as Record<string, unknown>;
  const isIdList = (ids: unknown): ids is string[] =>
    Array.isArray(ids) && ids.every((trackId) => typeof trackId === 'string');
  if (
    !isIdList(state.trackIds) ||
    typeof state.currentTrackId !== 'string' ||
    typeof state.position !== 'number' ||
    !Number.isFinite(state.position) ||
    state.position < 0 ||
    typeof state.shuffle !== 'boolean' ||
    (state.repeatMode !== 'none' &&
      state.repeatMode !== 'all' &&
      state.repeatMode !== 'single')
  ) {
    throw new Error('Saved player settings are not valid.');
  }
  return {
    trackIds: state.trackIds,
    currentTrackId: state.currentTrackId,
    position: state.position,
    shuffle: state.shuffle,
    repeatMode: state.repeatMode,
    ...(isIdList(state.originalTrackIds)
      ? { originalTrackIds: state.originalTrackIds }
      : {}),
  };
}

type PlaybackGlobal = typeof globalThis & {
  __musePlaybackController?: unknown;
};

/**
 * One player for the whole app session. It is never tied to a component, so
 * nothing in the UI can release it or rebuild it mid-song.
 */
export function getPlaybackController(): PlaybackController {
  const store = globalThis as PlaybackGlobal;
  const existing = store.__musePlaybackController;
  if (existing instanceof PlaybackController) {
    return existing;
  }
  if (existing) {
    // Development only: Fast Refresh re-ran this file, so the stored
    // controller was built from the previous code and lacks any new methods.
    // Release its player and start a fresh one from the current code.
    releaseStaleController(existing);
  }
  const controller = new PlaybackController();
  store.__musePlaybackController = controller;
  return controller;
}

function releaseStaleController(stale: unknown) {
  const old = stale as {
    dispose?: () => void;
    pause?: () => void;
    player?: { release?: () => void };
  };
  try {
    if (old.dispose) {
      old.dispose();
    } else {
      // Built before `dispose` existed.
      old.pause?.();
      old.player?.release?.();
    }
  } catch {
    // Already released.
  }
}
