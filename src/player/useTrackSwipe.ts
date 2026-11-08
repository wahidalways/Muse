import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  useCompetingGestures,
  usePanGesture,
} from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useWindowDimensions } from 'react-native';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { EASE_OUT, SNAP_BACK_SPRING, project, rubberband } from '../motion/motion';
import { settlePlayer, sheetTravel, type PlayerTransition } from './playerTransition';
import { hapticImpact } from '../utils/haptics';
import { preloadArtwork } from '../components/AlbumArtwork';
import type { MusicTrack } from '../types';

/** How far a swipe must be heading, after momentum, to change the song. */
const CHANGE_SONG_DISTANCE = 70;
/** The old song keeps going this much further as it fades out. */
const SONG_EXIT = 48;
/** The new song slides in this far from the other side. */
const SONG_ENTER = 28;
const SONG_OUT = { duration: 100, easing: EASE_OUT };
const SONG_IN = { duration: 200, easing: EASE_OUT };
/** The longest the new cover may hold up the slide-in. */
const ARTWORK_WAIT_MS = 100;
/** Safety net: if no new song arrives by then, the old one comes back. */
const SONG_WAIT_MS = 600;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Swipes on a compact now-playing row: sideways for next or previous, and
 * optionally up to pull the full player out of it, following the finger.
 *
 * A song change never waits on the JS thread to start moving. The old song
 * slides out and fades on the UI thread the moment the finger lifts (or a
 * skip button is tapped). The row swaps to the new song only while it is
 * invisible, after its cover is ready, then slides it in from the far side.
 * So a busy JS thread costs, at most, a slightly longer blank beat: never a
 * freeze, a jump, or a flash of the new title in the old spot.
 */
export function useTrackSwipe({
  track,
  onNext,
  onPrevious,
  trackAfterSkip,
  openDrag,
  follow = 'resist',
}: {
  track: MusicTrack;
  onNext: () => void;
  onPrevious: () => void;
  /** The song a skip would land on, or null when Previous would restart. */
  trackAfterSkip: (direction: 1 | -1) => MusicTrack | null;
  /** Leave out inside a scroll view, where an upward drag must scroll. */
  openDrag?: { transition: PlayerTransition; onOpenChange: (open: boolean) => void };
  /** 'resist' for a small row that stays put; 'finger' for the full player's big cover. */
  follow?: 'resist' | 'finger';
}) {
  const x = useSharedValue(0);
  const opacity = useSharedValue(1);
  /** Mid-change: sideways drags wait, so they cannot strand the row hidden. */
  const isChanging = useSharedValue(false);
  const { height: windowHeight } = useWindowDimensions();

  /** The song on screen, which trails `track` while the row changes over. */
  const [shownTrack, setShownTrack] = useState(track);
  const phase = useRef<'shown' | 'leaving' | 'hidden'>('shown');
  /** 1 next, -1 previous: the old song leaves against it, the new one comes from it. */
  const direction = useRef<1 | -1>(1);
  /** A song that arrived while the old one was still leaving. */
  const waitingTrack = useRef<MusicTrack | null>(null);
  const swapToken = useRef(0);
  const enterAfterSwap = useRef(false);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Ids of the song on screen and the last song seen, for the checks below. */
  const shownId = useRef(track.id);
  const seenId = useRef(track.id);

  /** Back to the song already shown, from wherever the row is. */
  const restore = useCallback(() => {
    phase.current = 'shown';
    isChanging.set(false);
    x.set(withSpring(0, SNAP_BACK_SPRING));
    opacity.set(withTiming(1, SONG_IN));
  }, [isChanging, opacity, x]);

  /** Swaps in the waiting song while hidden, once its cover is ready. */
  const swap = useCallback(() => {
    const next = waitingTrack.current;
    if (!next) {
      return;
    }
    waitingTrack.current = null;
    clearTimeout(restoreTimer.current);
    const token = ++swapToken.current;
    void Promise.race([preloadArtwork(next), wait(ARTWORK_WAIT_MS)]).then(() => {
      if (token !== swapToken.current || phase.current !== 'hidden') {
        // Another skip took over; keep this song in case it was a restart.
        waitingTrack.current ??= next;
        return;
      }
      if (next.id === shownId.current) {
        // Back to the song already shown (skipped away and back quickly).
        restore();
        return;
      }
      shownId.current = next.id;
      enterAfterSwap.current = true;
      setShownTrack(next);
    });
  }, [restore]);

  const onLeft = () => {
    phase.current = 'hidden';
    if (waitingTrack.current) {
      swap();
      return;
    }
    restoreTimer.current = setTimeout(() => {
      if (phase.current === 'hidden' && !waitingTrack.current) {
        restore();
      }
    }, SONG_WAIT_MS);
  };

  const leave = (dir: 1 | -1) => {
    'worklet';
    isChanging.set(true);
    opacity.set(withTiming(0, SONG_OUT));
    x.set(
      withTiming(x.get() - dir * SONG_EXIT, SONG_OUT, (finished) => {
        // Cut short only by another skip, which finishes the job itself.
        if (finished) {
          scheduleOnRN(onLeft);
        }
      }),
    );
  };

  // The new song is on screen, still invisible: slide it in. A layout
  // effect, so it starts the moment the swap commits, not a frame later.
  useLayoutEffect(() => {
    if (!enterAfterSwap.current) {
      return;
    }
    enterAfterSwap.current = false;
    phase.current = 'shown';
    isChanging.set(false);
    x.set(withSequence(withTiming(direction.current * SONG_ENTER, { duration: 0 }), withTiming(0, SONG_IN)));
    opacity.set(withTiming(1, SONG_IN));
  }, [isChanging, opacity, shownTrack.id, x]);

  // Covers of the songs either side, read ahead, so a skip rarely waits on one.
  useEffect(() => {
    for (const neighbour of [trackAfterSkip(1), trackAfterSkip(-1)]) {
      if (neighbour) {
        void preloadArtwork(neighbour);
      }
    }
  }, [shownTrack.id, trackAfterSkip]);

  // Any song change, from a skip here or anywhere else (a song ending, a
  // pick from a list), goes through the same leave, swap, enter.
  useEffect(() => {
    if (track.id === seenId.current) {
      return;
    }
    seenId.current = track.id;
    // Start reading the cover now, while the old song is still leaving.
    void preloadArtwork(track);
    waitingTrack.current = track;
    if (phase.current === 'hidden') {
      swap();
    } else if (phase.current === 'shown') {
      phase.current = 'leaving';
      direction.current = 1;
      scheduleOnUI(leave, 1);
    }
  });

  /** A skip that already started leaving on the UI thread (a swipe). */
  const commitSkip = (dir: 1 | -1) => {
    const next = trackAfterSkip(dir);
    if (!next) {
      // Previous is about to restart this song: it comes straight back.
      (dir === 1 ? onNext : onPrevious)();
      restore();
      return;
    }
    clearTimeout(restoreTimer.current);
    direction.current = dir;
    phase.current = 'leaving';
    // Known now, so it swaps in as soon as the old song is out, without
    // waiting for the whole app to re-render with the new song first.
    waitingTrack.current = next;
    seenId.current = next.id;
    void preloadArtwork(next);
    (dir === 1 ? onNext : onPrevious)();
  };

  /** For the skip buttons: the same motion as a swipe. */
  const skip = (dir: 1 | -1) => {
    if (!trackAfterSkip(dir)) {
      // A restart: the progress line jumping to the start says enough.
      (dir === 1 ? onNext : onPrevious)();
      return;
    }
    // Motion first, so it is already running while the skip does its work.
    scheduleOnUI(leave, dir);
    commitSkip(dir);
  };

  useEffect(() => () => clearTimeout(restoreTimer.current), []);

  const sideways = usePanGesture({
    // Clearly sideways only, so vertical scrolling still works around it.
    activeOffsetX: [-12, 12],
    failOffsetY: [-12, 12],
    onUpdate: (event) => {
      'worklet';
      if (isChanging.get()) {
        return;
      }
      // A drag that cuts a slide-in short shows the row at once.
      opacity.set(1);
      x.set(follow === 'finger' ? event.translationX : rubberband(event.translationX, 160));
    },
    onDeactivate: (event) => {
      'worklet';
      if (isChanging.get()) {
        return;
      }
      const projected = event.translationX + project(event.velocityX);
      if (!event.canceled && Math.abs(projected) > CHANGE_SONG_DISTANCE) {
        const dir = projected < 0 ? 1 : -1;
        leave(dir);
        scheduleOnRN(hapticImpact);
        scheduleOnRN(commitSkip, dir);
        return;
      }
      x.set(withSpring(0, { ...SNAP_BACK_SPRING, velocity: event.velocityX }));
    },
  });

  const upward = usePanGesture({
    enabled: openDrag !== undefined,
    activeOffsetY: -12,
    failOffsetX: [-12, 12],
    onUpdate: (event) => {
      'worklet';
      if (!openDrag) {
        return;
      }
      const travel = sheetTravel(openDrag.transition, windowHeight);
      openDrag.transition.progress.set(Math.min(1, Math.max(0, -event.translationY / travel)));
    },
    onDeactivate: (event) => {
      'worklet';
      if (!openDrag) {
        return;
      }
      const travel = sheetTravel(openDrag.transition, windowHeight);
      const projected = -event.translationY + project(-event.velocityY);
      const shouldOpen = !event.canceled && projected > travel * 0.3;
      settlePlayer(openDrag.transition, shouldOpen, -event.velocityY / travel);
      if (shouldOpen) {
        scheduleOnRN(hapticImpact);
        scheduleOnRN(openDrag.onOpenChange, true);
      }
    },
  });

  const gesture = useCompetingGestures(sideways, upward);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: x.get() }],
  }));
  // Same song with fresh details (a tag edit): show them without a change.
  const shown = shownTrack.id === track.id ? track : shownTrack;
  return { gesture, style, skip, shownTrack: shown };
}
