import { useState } from 'react';
import {
  Easing,
  FadeInLeft,
  FadeInRight,
  ReduceMotion,
  SlideInDown,
} from 'react-native-reanimated';

/**
 * Shared motion values. Everything here runs on the UI thread through
 * Reanimated, so animations keep their frame rate while JS is busy.
 */

/** Strong ease-out for things entering, leaving or settling. */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** The iOS sheet curve, used for the player sliding up and down. */
export const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

/** Settle without overshoot. */
export const SETTLE_SPRING = {
  duration: 400,
  dampingRatio: 1,
  reduceMotion: ReduceMotion.System,
} as const;

/** Snap back after a drag. Pass the release velocity alongside. */
export const SNAP_BACK_SPRING = {
  duration: 400,
  dampingRatio: 0.8,
  reduceMotion: ReduceMotion.System,
} as const;

/**
 * Where a flick would come to rest if the finger kept decelerating, so a fast
 * short swipe commits and a slow long one does not.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** The further past an edge, the less the element follows the finger. */
export function rubberband(
  overshoot: number,
  dimension: number,
  constant = 0.55,
): number {
  'worklet';
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  );
}

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

// Layout animations follow the phone's reduce-motion setting by default.

/** A page pushed on top, as on iOS: it comes in from the right. */
export const PUSH_IN = FadeInRight.duration(260).easing(EASE_OUT);
/** The page underneath, coming back after a pop: in from the left. */
export const POP_IN = FadeInLeft.duration(260).easing(EASE_OUT);
/** A bottom sheet rising on the iOS sheet curve; its backdrop fades. */
export const SHEET_IN = SlideInDown.duration(340).easing(EASE_SHEET);

/**
 * Whether `depth` (how many pages deep) last went up or down, for choosing
 * PUSH_IN or POP_IN. Null on first show, or after `scope` (such as the tab)
 * changes, so switching tabs does not slide.
 */
export function useNavDirection(depth: number, scope = ''): 'forward' | 'back' | null {
  const [nav, setNav] = useState({ depth, scope, direction: null as 'forward' | 'back' | null });
  if (nav.depth !== depth || nav.scope !== scope) {
    setNav({
      depth,
      scope,
      direction: nav.scope !== scope ? null : depth > nav.depth ? 'forward' : 'back',
    });
  }
  return nav.direction;
}
