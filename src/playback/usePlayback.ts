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
 * Position and duration. Updates every status tick, so only small
 * components (progress bars, time labels) should use it.
 */
export function usePlaybackProgress(): PlaybackProgress {
  const controller = getPlaybackController();
  return useSyncExternalStore(
    controller.subscribeProgress,
    controller.getProgress,
  );
}
