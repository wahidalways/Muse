import { useMemo } from 'react';
import { ReduceMotion, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * The mini player <-> full player morph, shared by both on the UI thread.
 *
 * `progress` is 0 for the mini player and 1 for the full player. Drags set
 * it directly, so the player follows the finger; releases, taps and the back
 * button spring it to `target`. The rects say where the mini player card and
 * its cover sit on screen, so the sheet grows out of the card and the cover
 * flies from the small artwork to the big one. Width 0 means not measured,
 * and the sheet then rises from the bottom edge instead. The rects are in
 * window coordinates; `origin` is where the player itself sits in the window,
 * so they line up exactly even when the app does not start at the very top.
 */
export type PlayerTransition = {
  progress: SharedValue<number>;
  target: SharedValue<number>;
  miniCard: SharedValue<Rect>;
  miniArt: SharedValue<Rect>;
  origin: SharedValue<{ x: number; y: number }>;
};

export const NO_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

/** One stable object for the app's lifetime: effects depend on it. */
export function usePlayerTransition(): PlayerTransition {
  const progress = useSharedValue(0);
  const target = useSharedValue(0);
  const miniCard = useSharedValue(NO_RECT);
  const miniArt = useSharedValue(NO_RECT);
  const origin = useSharedValue({ x: 0, y: 0 });
  return useMemo(
    () => ({ progress, target, miniCard, miniArt, origin }),
    [miniArt, miniCard, origin, progress, target],
  );
}

/** Critically damped: no bounce past either end, which would show a gap. */
const PLAYER_SPRING = {
  duration: 480,
  dampingRatio: 1,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
} as const;

/**
 * Springs to open (1) or closed (0). `velocity` is in progress per second,
 * so a flick hands its speed over and a slow drag eases in.
 */
export function settlePlayer(transition: PlayerTransition, open: boolean, velocity = 0) {
  'worklet';
  const to = open ? 1 : 0;
  transition.target.set(to);
  transition.progress.set(withSpring(to, { ...PLAYER_SPRING, velocity }));
}

/** How far the sheet travels between the two ends, in points. */
export function sheetTravel(transition: PlayerTransition, windowHeight: number): number {
  'worklet';
  const card = transition.miniCard.get();
  return Math.max(1, card.width > 0 ? card.y - transition.origin.get().y : windowHeight);
}
