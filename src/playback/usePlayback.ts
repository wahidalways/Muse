import { useSyncExternalStore } from 'react';

import {
  getPlaybackController,
  type PlaybackProgress,
  type PlaybackSnapshot,
} from './PlaybackController';

/**
 * Queue, current song, play/pause and modes. Changes only when one of those
 * changes, never on progress ticks.
 */
export function usePlayback(): PlaybackSnapshot {
  const controller = getPlaybackController();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}

/**
 * One value from the snapshot, re-rendering only when that value changes.
 * `select` must return a snapshot field or a primitive, never a new object.
 */
export function usePlaybackValue<T>(select: (snapshot: PlaybackSnapshot) => T): T {
  const controller = getPlaybackController();
  return useSyncExternalStore(controller.subscribe, () => select(controller.getSnapshot()));
}

/**
 * Only the current song's id. For code high up the tree (the app root):
 * it re-renders on a song change, never on play, pause or buffering.
 */
export function useCurrentTrackId(): string | null {
  const controller = getPlaybackController();
  return useSyncExternalStore(
    controller.subscribe,
    () => controller.getSnapshot().currentTrack?.id ?? null,
  );
}

const ignoreTicks = () => () => undefined;

/**
 * Position and duration. Updates every status tick, so only small
 * components (progress bars, time labels) should use it. With `live` false
 * (hidden, such as the closed player) ticks no longer re-render it; it reads
 * the position whenever it renders anyway, and follows ticks again once live.
 */
export function usePlaybackProgress(live = true): PlaybackProgress {
  const controller = getPlaybackController();
  return useSyncExternalStore(
    live ? controller.subscribeProgress : ignoreTicks,
    controller.getProgress,
  );
}
